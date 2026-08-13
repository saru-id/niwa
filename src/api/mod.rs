//! The Luau-facing API: the table `require("@niwa")` returns.
//!
//! Every function here does the same four things: capture where in the
//! config it was called, validate its spec, record declarations, and
//! hand back a frozen result. Nothing acts. Acting is the engine's
//! job, in a later pass, against the declarations collected here.

pub mod checklist;
pub mod custom;
pub mod defaults;
pub mod exec;
pub mod files;
pub mod packages;
mod spec;
pub mod system;
pub mod values;

use std::cell::RefCell;
use std::collections::HashMap;
use std::path::PathBuf;
use std::rc::Rc;

use mlua::{Lua, Table};

use crate::engine::{Engine, Truth};
use crate::facts::Facts;
use crate::model::{Declaration, Identity, Provenance, Unit};

/// Everything a config run collects.
#[derive(Default)]
pub struct RunState {
    pub declarations: Vec<Declaration>,
    /// Inside `niwa.once`, the marker is the guard, so `niwa.run`
    /// drops its guard requirement.
    pub in_once: bool,
    /// Custom kind names already defined this run.
    pub custom_kinds: std::collections::HashSet<String>,
    /// Memoised queries: the whole run sees one consistent world.
    pub exists_cache: HashMap<String, bool>,
    pub command_cache: HashMap<String, bool>,
    /// Custom checks' exec answers, memoised per run by command line.
    pub exec_cache: HashMap<String, (String, Option<i32>)>,
    /// Every `niwa.secret` the run asked for, for `doctor`.
    pub secrets_used: Vec<(String, Option<String>)>,
    /// Has the config read any result yet? A branch on `.changed` is
    /// a guard, and this is how `niwa.run` knows one is in force.
    pub results_read: bool,
}

/// Shared context for every API function.
#[derive(Clone)]
pub struct Ctx {
    pub state: Rc<RefCell<RunState>>,
    /// Where this run reads and writes; one shape for the whole VM.
    pub paths: crate::paths::Paths,
    /// The engine behind this pass. `None` is check mode: validate
    /// and record, touch nothing, predict nothing.
    pub engine: Option<Rc<Engine>>,
}

impl Ctx {
    pub fn record(&self, declaration: Declaration) {
        self.state.borrow_mut().declarations.push(declaration);
    }

    /// Resolve a `@self/` source path against the config root. The
    /// alias is required: sources live in the config repo, or `pull`
    /// has nowhere to bring edits home to. A trailing slash marks a
    /// directory source and resolves the same way.
    pub fn self_path(&self, alias: &str) -> Option<PathBuf> {
        let rest = alias.strip_prefix("@self/")?.trim_end_matches('/');
        if rest.is_empty() || rest.split('/').any(|part| part.is_empty() || part == "..") {
            return None;
        }
        Some(self.paths.config.join(rest))
    }

    /// Expand `~/` against the home directory; absolute paths pass
    /// through as written. Dot-dot never does: a target that walks
    /// upward could leave home behind niwa's back — and leave a
    /// sandbox rehearsal, whose whole promise is staying inside.
    pub fn target_path(&self, target: &str) -> Option<PathBuf> {
        if target.split('/').any(|part| part == "..") {
            return None;
        }
        target
            .strip_prefix("~/")
            .map(|rest| self.paths.home.join(rest))
            .or_else(|| target.starts_with('/').then(|| PathBuf::from(target)))
    }
}

/// Build the whole API table and freeze it.
pub fn build(lua: &Lua, ctx: &Ctx, facts: &Facts) -> mlua::Result<Table> {
    let niwa = lua.create_table()?;
    files::register(lua, &niwa, ctx)?;
    defaults::register(lua, &niwa, ctx)?;
    packages::register(lua, &niwa, ctx, &facts.brew_prefix)?;
    system::register(lua, &niwa, ctx)?;
    exec::register(lua, &niwa, ctx)?;
    checklist::register(lua, &niwa, ctx)?;
    values::register(lua, &niwa, ctx, facts)?;
    custom::register(lua, &niwa, ctx)?;
    freeze(lua, &niwa)?;
    Ok(niwa)
}

/// Freeze a table with Luau's own `table.freeze`, so nothing niwa
/// hands out can be monkey-patched by a config.
pub fn freeze(lua: &Lua, table: &Table) -> mlua::Result<()> {
    let freeze: mlua::Function = lua.globals().get::<Table>("table")?.get("freeze")?;
    freeze.call::<()>(table)
}

/// Where in the config the current API call was made. Walks the stack
/// past any Lua-side wrappers to the nearest chunk we loaded.
pub fn provenance(lua: &Lua) -> Provenance {
    for level in 1..=8 {
        let found = lua.inspect_stack(level, |debug| {
            let source = debug.source();
            let file = source
                .short_src
                .map(std::borrow::Cow::into_owned)
                .unwrap_or_default();
            let line = debug.current_line().unwrap_or(0);
            (file, line)
        });
        match found {
            Some((file, line)) if !file.is_empty() && !file.starts_with("[C]") && line > 0 => {
                #[allow(
                    clippy::cast_possible_truncation,
                    reason = "config files do not reach four billion lines"
                )]
                return Provenance {
                    file,
                    line: line as u32,
                };
            }
            Some(_) => {}
            None => break,
        }
    }
    Provenance {
        file: "config".to_string(),
        line: 0,
    }
}

/// The unit a provenance belongs to.
pub fn unit_of(provenance: &Provenance) -> Unit {
    Unit::from_chunk(&provenance.file)
}

/// Record a declaration and let the engine settle it. `None` means
/// the answer waits behind the batch barrier.
pub fn settle_truth(ctx: &Ctx, declaration: &Declaration) -> mlua::Result<Option<Truth>> {
    ctx.record(declaration.clone());
    ctx.engine
        .as_ref()
        .map_or(Ok(Some(Truth::UNCHANGED)), |engine| {
            engine.settle(declaration).map_err(mlua::Error::external)
        })
}

/// The frozen result table for a settled truth. Fields answer through
/// a metatable, so the config reading one is an observable event —
/// that is how a branch on `.changed` counts as a guard.
pub fn result_table(lua: &Lua, ctx: &Ctx, truth: &Truth) -> mlua::Result<Table> {
    let state = Rc::clone(&ctx.state);
    let truth = truth.clone();
    let index = lua.create_function(move |lua, (_, key): (Table, String)| {
        state.borrow_mut().results_read = true;
        truth_field(lua, &truth, &key)
    })?;
    frozen_result(lua, index)
}

/// The four fields both result tables answer with.
fn truth_field(lua: &Lua, truth: &Truth, key: &str) -> mlua::Result<mlua::Value> {
    Ok(match key {
        "changed" => mlua::Value::Boolean(truth.changed),
        "present" => mlua::Value::Boolean(truth.present),
        "failed" => mlua::Value::Boolean(truth.failed),
        "version" => match &truth.version {
            Some(version) => mlua::Value::String(lua.create_string(version)?),
            None => mlua::Value::Nil,
        },
        _ => mlua::Value::Nil,
    })
}

/// A frozen table whose every read runs `index`.
fn frozen_result(lua: &Lua, index: mlua::Function) -> mlua::Result<Table> {
    let table = lua.create_table()?;
    let meta = lua.create_table()?;
    meta.set("__index", index)?;
    table.set_metatable(Some(meta))?;
    freeze(lua, &table)?;
    Ok(table)
}

/// Settle one declaration into one result table, pending or not.
pub fn settle(lua: &Lua, ctx: &Ctx, declaration: &Declaration) -> mlua::Result<Table> {
    settle_truth(ctx, declaration)?.map_or_else(
        || pending_result(lua, ctx, declaration.identity.clone()),
        |truth| result_table(lua, ctx, &truth),
    )
}

/// One result standing for several declarations (a defaults table, a
/// directory fan-out): changed when any changed, present when all are.
pub fn aggregate(truths: &[Truth]) -> Truth {
    Truth {
        changed: truths.iter().any(|truth| truth.changed),
        present: truths.iter().all(|truth| truth.present),
        failed: truths.iter().any(|truth| truth.failed),
        version: None,
    }
}

/// A result whose fields resolve on first read: reading any of them
/// flushes the pending batch, so `.changed` is the truth, never a
/// guess.
fn pending_result(lua: &Lua, ctx: &Ctx, identity: Identity) -> mlua::Result<Table> {
    let Some(engine) = ctx.engine.clone() else {
        return Err(mlua::Error::RuntimeError(
            "a pending result needs an engine".to_string(),
        ));
    };
    let state = Rc::clone(&ctx.state);
    let index = lua.create_function(move |lua, (_, key): (Table, String)| {
        state.borrow_mut().results_read = true;
        let truth = engine.resolve(&identity).map_err(mlua::Error::external)?;
        truth_field(lua, &truth, &key)
    })?;
    frozen_result(lua, index)
}

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

use crate::facts::Facts;
use crate::model::{Declaration, Provenance, Unit};

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
}

/// Shared context for every API function.
#[derive(Clone)]
pub struct Ctx {
    pub state: Rc<RefCell<RunState>>,
    /// The config repo root, for `@self/` sources.
    pub root: PathBuf,
    /// The user's home, for `~/` targets.
    pub home: PathBuf,
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
        Some(self.root.join(rest))
    }

    /// Expand `~/` against the home directory; absolute paths pass
    /// through untouched.
    pub fn target_path(&self, target: &str) -> Option<PathBuf> {
        target
            .strip_prefix("~/")
            .map(|rest| self.home.join(rest))
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

/// The stub result every resource returns while providers do not read
/// the machine yet: nothing changed, the resource reads as present.
pub fn stub_result(lua: &Lua) -> mlua::Result<Table> {
    let result = lua.create_table()?;
    result.set("changed", false)?;
    result.set("present", true)?;
    freeze(lua, &result)?;
    Ok(result)
}

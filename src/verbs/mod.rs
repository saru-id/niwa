//! One module per verb. Verbs orchestrate; the layers below them own
//! the behavior.

pub mod add;
pub mod apply_verb;
pub mod check;
pub mod doctor;
pub mod explain;
pub mod fmt;
pub mod machines;
pub mod plan;
pub mod pull;
pub mod seal_key;
pub mod undo;
pub mod update;

use std::rc::Rc;

use crate::engine::Engine;
use crate::error::Error;
use crate::luau::{Limits, Runtime};
use crate::model::analysis::{Analysis, analyze};
use crate::model::{Kind, Value};
use crate::paths::Paths;

/// One pass over the config: run it, lint conflicts, and require
/// every `@self/` source to exist. Check passes no engine; plan and
/// apply pass one in the mode they mean.
pub fn run_pass(paths: &Paths, engine: Option<Rc<Engine>>) -> Result<Analysis, Error> {
    if !paths.config.join("init.luau").is_file() {
        return Err(Error::ConfigMissing {
            dir: paths.config.clone(),
        });
    }
    let runtime = Runtime::new(paths, &Limits::default(), engine)?;
    runtime.run_entry()?;

    let declarations = runtime.declarations();
    let analysis = analyze(&declarations);
    if !analysis.conflicts.is_empty() {
        return Err(Error::Conflicts(analysis.conflicts));
    }

    let mut missing = Vec::new();
    for declaration in &declarations {
        let field = match declaration.identity.kind {
            Kind::File => "source",
            Kind::Link => "to",
            _ => continue,
        };
        let Value::Map(fields) = &declaration.spec else {
            continue;
        };
        let Some(Value::Str(source)) = fields.get(field) else {
            continue;
        };
        let resolved = source
            .strip_prefix("@self/")
            .map(|rest| paths.config.join(rest.trim_end_matches('/')));
        if !resolved.is_some_and(|path| path.exists()) {
            missing.push((source.clone(), declaration.provenance.clone()));
        }
    }
    if !missing.is_empty() {
        return Err(Error::MissingSources(missing));
    }

    let gate_hits = crate::gate::scan_repo(&paths.config);
    if !gate_hits.is_empty() {
        return Err(Error::Gate(
            gate_hits
                .into_iter()
                .map(|hit| (hit.file, hit.line, hit.reason))
                .collect(),
        ));
    }

    Ok(analysis)
}

/// The secrets a config asks for, from one quiet validation pass.
/// `None` when the config does not load; the caller reports that
/// through its own channel.
pub fn secrets_used(paths: &Paths) -> Option<Vec<(String, Option<String>)>> {
    let runtime = Runtime::new(paths, &Limits::default(), None).ok()?;
    runtime.run_entry().ok()?;
    Some(runtime.secrets_used())
}

/// Turn a finished plan pass into the display plan: one item per
/// identity, the last host declaration winning over modules, in
/// first-declared order.
pub fn plan_of(engine: Rc<Engine>) -> crate::plan::Plan {
    let items = Rc::try_unwrap(engine).map_or_else(|_| Vec::new(), Engine::into_items);
    let mut order: Vec<crate::model::Identity> = Vec::new();
    let mut chosen: std::collections::HashMap<crate::model::Identity, crate::plan::Item> =
        std::collections::HashMap::new();
    for item in items {
        let identity = item.declaration.identity.clone();
        match chosen.entry(identity.clone()) {
            std::collections::hash_map::Entry::Vacant(slot) => {
                order.push(identity);
                slot.insert(item);
            }
            std::collections::hash_map::Entry::Occupied(mut slot) => {
                // Later host declarations win; everything else keeps
                // its first appearance.
                if item.declaration.unit.is_host() {
                    slot.insert(item);
                }
            }
        }
    }
    let items = order
        .into_iter()
        .filter_map(|identity| chosen.remove(&identity))
        .collect();
    crate::plan::Plan { items }
}

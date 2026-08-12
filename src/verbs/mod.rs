//! One module per verb. Verbs orchestrate; the layers below them own
//! the behavior.

pub mod apply_verb;
pub mod check;
pub mod plan;
pub mod undo;

use crate::error::Error;
use crate::luau::{Limits, Runtime};
use crate::model::analysis::{Analysis, analyze};
use crate::model::{Kind, Value};
use crate::paths::Paths;

/// Load and validate the config: run it, lint conflicts, and require
/// every `@self/` source to exist. Both `check` and `plan` start here.
pub fn load_config(paths: &Paths) -> Result<Analysis, Error> {
    if !paths.config.join("init.luau").is_file() {
        return Err(Error::ConfigMissing {
            dir: paths.config.clone(),
        });
    }
    let runtime = Runtime::new(&paths.config, &paths.home, &Limits::default())?;
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

    Ok(analysis)
}

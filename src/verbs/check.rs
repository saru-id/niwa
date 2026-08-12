//! `niwa check`: load the config and prove it is well formed. The
//! specs validate as the script runs; afterwards, duplicates fold,
//! conflicts lint with both source locations, and every `@self/`
//! source the config points at must exist.
//! Exit codes: 0 clean, 1 problems.

use std::process::ExitCode;

use crate::error::Error;
use crate::luau::{Limits, Runtime};
use crate::model::analysis::analyze;
use crate::model::{Kind, Value};
use crate::out::{Mark, Out, count};
use crate::paths::Paths;

pub fn run(out: &Out) -> ExitCode {
    match check() {
        Ok(resources) => {
            let line = format!("{} · config is valid", count(resources, "resource"));
            out.result(Mark::Ok, &line);
            ExitCode::SUCCESS
        }
        Err(error) => {
            out.error(&error);
            ExitCode::FAILURE
        }
    }
}

fn check() -> Result<usize, Error> {
    let paths = Paths::resolve()?;
    if !paths.config.join("init.luau").is_file() {
        return Err(Error::ConfigMissing { dir: paths.config });
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
            .map(|rest| paths.config.join(rest));
        if !resolved.is_some_and(|path| path.exists()) {
            missing.push((source.clone(), declaration.provenance.clone()));
        }
    }
    if !missing.is_empty() {
        return Err(Error::MissingSources(missing));
    }

    Ok(analysis.resources)
}

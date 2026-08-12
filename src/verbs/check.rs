//! `niwa check`: load the config and prove it is well formed. The
//! specs validate as the script runs; afterwards, duplicates fold,
//! conflicts lint with both source locations, and every `@self/`
//! source the config points at must exist.
//! Exit codes: 0 clean, 1 problems.

use std::process::ExitCode;

use crate::error::Error;
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
    let analysis = super::load_config(&paths)?;
    Ok(analysis.effective.len())
}

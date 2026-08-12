//! `niwa check`: load the config and prove it is well formed.
//! Exit codes: 0 clean, 1 problems.

use std::process::ExitCode;

use crate::error::Error;
use crate::luau::{Limits, Runtime};
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
    let runtime = Runtime::new(&paths.config, &Limits::default())?;
    runtime.run_entry()?;
    Ok(0)
}

//! `niwa migrate`: rewrite deprecated config forms in place. At this
//! version the API has deprecated nothing, and saying so plainly is
//! the whole job — the version refusals for a newer journal or a
//! config migrated past this niwa live in the loaders, and fire on
//! every verb.

use std::process::ExitCode;

use crate::error::Error;
use crate::journal::Journal;
use crate::out::{Mark, Out};
use crate::paths::Paths;

pub fn run(out: &Out) -> ExitCode {
    super::finish(out, migrate(out))
}

fn migrate(out: &Out) -> Result<ExitCode, Error> {
    let paths = Paths::resolve()?;
    // Loading is the compatibility check: a journal or lockfile from
    // a newer niwa refuses here with the way out named.
    let _ = Journal::load(&paths.state)?;
    let _ = crate::lockfile::Lockfile::load(&paths)?;
    super::run_pass(&paths, None)?;
    out.result(
        Mark::Ok,
        &format!(
            "nothing to migrate · no form is deprecated at {}",
            env!("CARGO_PKG_VERSION")
        ),
    );
    Ok(ExitCode::SUCCESS)
}

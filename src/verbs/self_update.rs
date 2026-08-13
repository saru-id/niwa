//! `niwa self update`: the tool updating itself is always a decision,
//! never a surprise. Before 1.0.0 there is no release channel, and
//! this verb says so instead of pretending — the fetch, verify, and
//! atomic swap land with the first published release.

use std::process::ExitCode;

use crate::error::Error;
use crate::out::{Mark, Out};

pub fn run(out: &Out, action: &str, rollback: bool) -> ExitCode {
    super::finish(out, self_update(out, action, rollback))
}

fn self_update(out: &Out, action: &str, rollback: bool) -> Result<ExitCode, Error> {
    if action != "update" {
        return Err(Error::apply(
            format!("running self {action}"),
            "self knows one action: update (with --rollback for the previous pair)",
        ));
    }
    let _ = rollback;
    out.result(
        Mark::Failed,
        &format!(
            "no release channel exists yet · this is {} from source, and updates begin at 1.0.0",
            env!("CARGO_PKG_VERSION")
        ),
    );
    Ok(ExitCode::FAILURE)
}

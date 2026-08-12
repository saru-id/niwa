//! The escape hatch, executed: `niwa.run` and `niwa.once`.
//!
//! A run's guard decides whether there is work: `unless` true or
//! `only_if` false or `creates` already present means nothing to do.
//! A once's journal marker is its guard. Both are irreversible, and
//! the journal says so in those words, so undo can name what it will
//! not be able to take back.

use std::time::Duration;

use crate::journal::Journal;
use crate::model::action::Action;
use crate::model::{Declaration, Value};
use crate::paths::Paths;
use crate::util::proc::bounded_output;

/// The default budget for a guarded command; a spec's `timeout`
/// replaces it.
const DEFAULT_TIMEOUT: Duration = Duration::from_mins(10);

/// What the plan says about a run declaration.
pub fn compare_run(declaration: &Declaration, paths: &Paths) -> Action {
    if guard_satisfied(declaration, paths) {
        Action::InSync
    } else {
        Action::Create
    }
}

/// What the plan says about a once marker.
pub fn compare_once(declaration: &Declaration, journal: &Journal) -> Action {
    if journal
        .acknowledged(&declaration.identity.to_string())
        .is_some()
    {
        Action::InSync
    } else {
        Action::Create
    }
}

/// Is the run already done, by its own guard's testimony? Guards are
/// read-only, which is why they can answer during a plan.
fn guard_satisfied(declaration: &Declaration, paths: &Paths) -> bool {
    let Value::Map(fields) = &declaration.spec else {
        return false;
    };
    if matches!(fields.get("unless"), Some(Value::Bool(true))) {
        return true;
    }
    if matches!(fields.get("only_if"), Some(Value::Bool(false))) {
        return true;
    }
    if let Some(Value::Str(creates)) = fields.get("creates") {
        let target = creates.strip_prefix("~/").map_or_else(
            || std::path::PathBuf::from(creates),
            |rest| paths.home.join(rest),
        );
        if target.exists() {
            return true;
        }
    }
    false
}

/// Run the command through the shell, on its declared clock. The
/// stderr tail comes back for the failure screen.
pub fn run(declaration: &Declaration) -> Result<(), (Option<i32>, String)> {
    let command = &declaration.identity.key;
    let timeout = match &declaration.spec {
        Value::Map(fields) => match fields.get("timeout") {
            Some(Value::Str(text)) => crate::api::parse_duration(text).unwrap_or(DEFAULT_TIMEOUT),
            _ => DEFAULT_TIMEOUT,
        },
        _ => DEFAULT_TIMEOUT,
    };
    match bounded_output("/bin/sh", &["-c", command], timeout) {
        Some(finished) if finished.code == Some(0) => Ok(()),
        Some(finished) => Err((finished.code, finished.stderr_tail)),
        None => Err((
            None,
            "the command did not finish inside its timeout".to_string(),
        )),
    }
}

/// Is a run declaration marked optional?
pub fn is_optional(declaration: &Declaration) -> bool {
    matches!(
        &declaration.spec,
        Value::Map(fields) if matches!(fields.get("optional"), Some(Value::Bool(true)))
    )
}

//! `niwa apply`: plan, confirm, execute. Exit 0 on success, 1 on an
//! error. `--yes` skips the confirmation and refuses a dirty config
//! tree unless `--dirty` says you truly mean it. `--verify` re-checks
//! everything after the run and names anything not idempotent.

use std::io::IsTerminal as _;
use std::process::ExitCode;
use std::time::Duration;

use crate::apply::{Lock, Outcome, execute};
use crate::error::Error;
use crate::journal::Journal;
use crate::out::{Mark, Out, count};
use crate::paths::Paths;
use crate::plan::{Action, plan};
use crate::util::proc::bounded_stdout;

#[allow(
    clippy::struct_excessive_bools,
    reason = "these mirror four independent command line flags"
)]
pub struct Options {
    pub yes: bool,
    pub dirty: bool,
    pub force: bool,
    pub verify: bool,
}

pub fn run(out: &Out, options: &Options) -> ExitCode {
    match apply(out, options) {
        Ok(code) => code,
        Err(error) => {
            out.error(&error);
            ExitCode::FAILURE
        }
    }
}

fn apply(out: &Out, options: &Options) -> Result<ExitCode, Error> {
    let paths = Paths::resolve()?;
    let analysis = super::load_config(&paths)?;

    // Unattended, a dirty tree means someone forgot to commit, and an
    // apply nobody watched would poison the stamp's honesty.
    if options.yes && !options.dirty && tree_is_dirty(&paths) {
        return Err(Error::DirtyTree);
    }

    let _lock = Lock::take(&paths.state)?;
    let mut journal = Journal::load(&paths.state)?;
    let intent = plan(analysis.effective, &paths, &journal);

    let pending = intent.pending();
    if pending == 0 {
        let line = format!("{} · nothing to do", count(intent.items.len(), "resource"));
        out.result(Mark::Ok, &line);
        return Ok(ExitCode::SUCCESS);
    }

    super::plan::render_pending(out, &intent);

    if !options.yes {
        if !std::io::stdin().is_terminal() {
            return Err(Error::NeedsConfirmation);
        }
        eprint!("apply {}? [y/N] ", count(pending, "change"));
        let mut answer = String::new();
        if std::io::stdin().read_line(&mut answer).is_err()
            || !matches!(answer.trim(), "y" | "Y" | "yes")
        {
            out.result(Mark::Ok, "canceled · nothing changed");
            return Ok(ExitCode::FAILURE);
        }
    }

    let report = execute(intent, &paths, &mut journal, options.force)?;

    let unchecked = report
        .executed
        .iter()
        .filter(|outcome| matches!(outcome, Outcome::Unchecked))
        .count();
    let mut summary = format!(
        "{} checked · {} changed",
        report.executed.len() - unchecked,
        report.changed()
    );
    if !report.protected.is_empty() {
        use std::fmt::Write as _;
        let _ = write!(summary, " · {} protected", report.protected.len());
    }
    out.result(Mark::Ok, &summary);
    for identity in &report.protected {
        out.note(&format!(
            "{identity} holds edits niwa never wrote: pull them home, or apply --force"
        ));
    }

    if options.verify {
        return Ok(verify(out, &paths, &journal));
    }
    Ok(ExitCode::SUCCESS)
}

/// The literal definition of idempotence: re-read everything, demand
/// silence, and name the resource and source line of anything that
/// still reports a change.
fn verify(out: &Out, paths: &Paths, journal: &Journal) -> ExitCode {
    let analysis = match super::load_config(paths) {
        Ok(analysis) => analysis,
        Err(error) => {
            out.error(&error);
            return ExitCode::FAILURE;
        }
    };
    let second = plan(analysis.effective, paths, journal);
    let unsettled: Vec<String> = second
        .items
        .iter()
        .filter(|item| matches!(item.action, Action::Create | Action::Change { .. }))
        .map(|item| {
            format!(
                "{} ({})",
                item.declaration.identity, item.declaration.provenance
            )
        })
        .collect();
    if unsettled.is_empty() {
        out.result(Mark::Ok, "verified · a second pass changes nothing");
        return ExitCode::SUCCESS;
    }
    out.result(Mark::Failed, "not idempotent");
    for line in &unsettled {
        out.note(line);
    }
    ExitCode::FAILURE
}

/// Is the config repo's working tree dirty? A config that is not a
/// git repository has nothing to be dirty.
fn tree_is_dirty(paths: &Paths) -> bool {
    if !paths.config.join(".git").exists() {
        return false;
    }
    let config = paths.config.display().to_string();
    bounded_stdout(
        "git",
        &["-C", &config, "status", "--porcelain"],
        Duration::from_secs(10),
    )
    .is_some_and(|status| !status.is_empty())
}

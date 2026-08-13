//! `niwa undo`: reverse the most recent apply, newest effect first,
//! with the same plan-then-confirm shape apply has.

use std::io::IsTerminal as _;
use std::process::ExitCode;

use crate::apply::{Lock, reverse_last};
use crate::error::Error;
use crate::journal::Journal;
use crate::out::{Mark, Out, count};
use crate::paths::Paths;

pub fn run(out: &Out, yes: bool) -> ExitCode {
    super::finish(out, undo(out, yes))
}

fn undo(out: &Out, yes: bool) -> Result<ExitCode, Error> {
    let paths = Paths::resolve()?;
    let _lock = Lock::take(&paths.state)?;
    let mut journal = Journal::load(&paths.state)?;

    let Some(entry) = journal.last_apply() else {
        out.result(Mark::Ok, "nothing to undo");
        return Ok(ExitCode::SUCCESS);
    };

    let steps: Vec<String> = entry
        .steps
        .iter()
        .rev()
        .map(|step| match &step.effect {
            crate::journal::Effect::Irreversible { what } => {
                format!(
                    "{} · cannot be taken back: `{what}` already ran",
                    step.identity
                )
            }
            _ => step.identity.clone(),
        })
        .collect();
    out.result(
        Mark::Changed,
        &format!("undo would reverse {}", count(steps.len(), "change")),
    );
    for line in &steps {
        out.note(line);
    }

    if !yes {
        if !std::io::stdin().is_terminal() {
            return Err(Error::NeedsConfirmation);
        }
        if !out.confirm(&format!("undo {}? [y/N]", count(steps.len(), "change"))) {
            out.result(Mark::Ok, "canceled · nothing changed");
            return Ok(ExitCode::FAILURE);
        }
    }

    // Only reversible steps count in either direction: what could
    // not be taken back is named, never tallied.
    let reversible = |entry: &crate::journal::ApplyEntry| {
        entry
            .steps
            .iter()
            .filter(|step| !matches!(step.effect, crate::journal::Effect::Irreversible { .. }))
            .count()
    };
    let target = journal.last_apply().map(|entry| entry.id);
    let before = journal.last_apply().map_or(0, &reversible);
    let reversed = match reverse_last(&paths, &mut journal) {
        Ok(reversed) => reversed,
        Err(error) => {
            // The machine's state, counted: what came back, what did
            // not, and that running undo again resumes from here.
            // Only the entry this undo targeted counts: a drained
            // entry means everything reversible in it came back.
            let remaining = journal
                .last_apply()
                .filter(|entry| Some(entry.id) == target)
                .map_or(0, &reversible);
            out.error(&error);
            out.result(
                Mark::Failed,
                &format!(
                    "{} reversed · {} not reversed · run `niwa undo` again once the cause is fixed",
                    count(before.saturating_sub(remaining), "change"),
                    count(remaining, "change"),
                ),
            );
            return Ok(ExitCode::FAILURE);
        }
    };

    out.result(Mark::Ok, &format!("{} reversed", count(reversed, "change")));
    Ok(ExitCode::SUCCESS)
}

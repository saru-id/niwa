//! `niwa undo`: reverse the most recent apply, newest effect first,
//! with the same plan-then-confirm shape apply has.

use std::io::IsTerminal as _;
use std::process::ExitCode;

use crate::apply::{Lock, reverse};
use crate::error::Error;
use crate::journal::Journal;
use crate::out::{Mark, Out, count};
use crate::paths::Paths;

pub fn run(out: &Out, yes: bool) -> ExitCode {
    match undo(out, yes) {
        Ok(code) => code,
        Err(error) => {
            out.error(&error);
            ExitCode::FAILURE
        }
    }
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
        eprint!("undo {}? [y/N] ", count(steps.len(), "change"));
        let mut answer = String::new();
        if std::io::stdin().read_line(&mut answer).is_err()
            || !matches!(answer.trim(), "y" | "Y" | "yes")
        {
            out.result(Mark::Ok, "canceled · nothing changed");
            return Ok(ExitCode::FAILURE);
        }
    }

    let Some(entry) = journal.pop_apply() else {
        out.result(Mark::Ok, "nothing to undo");
        return Ok(ExitCode::SUCCESS);
    };
    journal.save(&paths.state)?;
    let reversed = reverse(&entry, &paths, &mut journal)?;
    journal.save(&paths.state)?;

    out.result(Mark::Ok, &format!("{} reversed", count(reversed, "change")));
    Ok(ExitCode::SUCCESS)
}

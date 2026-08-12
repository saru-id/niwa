//! `niwa history`: the applies before the last one. `undo` reaches
//! the newest; this browses the story behind it.

use std::process::ExitCode;

use crate::error::Error;
use crate::journal::Journal;
use crate::out::{Mark, Out, count};
use crate::paths::Paths;

pub fn run(out: &Out) -> ExitCode {
    match history(out) {
        Ok(code) => code,
        Err(error) => {
            out.error(&error);
            ExitCode::FAILURE
        }
    }
}

fn history(out: &Out) -> Result<ExitCode, Error> {
    let paths = Paths::resolve()?;
    let journal = Journal::load(&paths.state)?;
    let applies = journal.applies();

    if applies.is_empty() {
        out.result(Mark::Ok, "no applies have changed anything yet");
        return Ok(ExitCode::SUCCESS);
    }

    for (position, entry) in applies.iter().enumerate().rev() {
        let newest = position == applies.len() - 1;
        let when = entry
            .when
            .as_deref()
            .map_or_else(String::new, |when| format!(" · {}", out.when(when)));
        let reach = if newest {
            " · undo reaches this one"
        } else {
            ""
        };
        out.plain(&format!(
            "#{}{when} · {}{reach}",
            entry.id,
            count(entry.steps.len(), "change")
        ));
        for step in entry.steps.iter().take(4) {
            out.note(&step.identity);
        }
        if entry.steps.len() > 4 {
            out.note(&format!("… {} more", entry.steps.len() - 4));
        }
    }
    Ok(ExitCode::SUCCESS)
}

//! `niwa machines`: the fleet from its stamps, and the only question
//! that matters — who is behind.

use std::process::ExitCode;

use crate::error::Error;
use crate::out::{Mark, Out, ago};
use crate::paths::Paths;

pub fn run(out: &Out) -> ExitCode {
    match machines(out) {
        Ok(code) => code,
        Err(error) => {
            out.error(&error);
            ExitCode::FAILURE
        }
    }
}

fn machines(out: &Out) -> Result<ExitCode, Error> {
    let paths = Paths::resolve()?;
    let stamps = crate::stamp::read_all(&paths);
    if stamps.is_empty() {
        out.result(Mark::Ok, "no machines yet · the first apply writes a stamp");
        return Ok(ExitCode::SUCCESS);
    }

    let this_machine = crate::stamp::machine_id(&paths);
    let name_width = stamps.iter().map(|(stem, _)| stem.len()).max().unwrap_or(0);
    let mut lines = Vec::new();
    for (stem, stamp) in stamps {
        let cursor = if stamp.machine_id == this_machine {
            '*'
        } else {
            ' '
        };
        let position = stamp.config.as_deref().map_or_else(
            || "(no commit)".to_string(),
            |commit| {
                let where_at = match crate::stamp::behind(&paths, commit) {
                    Some(0) => "(current)".to_string(),
                    Some(n) => format!("({n} behind)"),
                    None => "(unknown)".to_string(),
                };
                let dirty = if stamp.dirty { " + dirty" } else { "" };
                format!("{commit}{dirty}  {where_at}")
            },
        );
        lines.push(format!(
            "{cursor} {stem:name_width$}   applied {:10}   {position}   {} resources",
            ago(&stamp.applied),
            stamp.resources
        ));
    }
    for line in lines {
        out.plain(line.trim_end());
    }
    Ok(ExitCode::SUCCESS)
}

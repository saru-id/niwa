//! `niwa tag`: the one fact you author rather than read. A tag lives
//! beside the journal, shows in the stamp, and answers
//! `niwa.machine.tags.work` from the first line of the config.

use std::process::ExitCode;

use crate::error::Error;
use crate::out::{Mark, Out};
use crate::paths::Paths;

pub fn run(out: &Out, name: Option<&str>, remove: bool) -> ExitCode {
    match tag(out, name, remove) {
        Ok(code) => code,
        Err(error) => {
            out.error(&error);
            ExitCode::FAILURE
        }
    }
}

fn tag(out: &Out, name: Option<&str>, remove: bool) -> Result<ExitCode, Error> {
    let paths = Paths::resolve()?;
    let mut tags = crate::facts::read_tags(&paths);

    let Some(name) = name else {
        if tags.is_empty() {
            out.result(Mark::Ok, "no tags on this machine");
        } else {
            out.result(Mark::Ok, &format!("tags: {}", tags.join(", ")));
        }
        return Ok(ExitCode::SUCCESS);
    };

    if name.is_empty()
        || name
            .chars()
            .any(|c| !(c.is_ascii_alphanumeric() || c == '-' || c == '_'))
    {
        return Err(Error::Apply {
            doing: "tagging".to_string(),
            detail: format!("`{name}` is not a tag: use letters, digits, - and _"),
        });
    }

    if remove {
        tags.retain(|tag| tag != name);
    } else if !tags.iter().any(|tag| tag == name) {
        tags.push(name.to_string());
    }
    tags.sort();

    std::fs::create_dir_all(&paths.state)
        .map_err(|error| Error::apply("creating the state directory", error))?;
    let mut text = tags.join("\n");
    if !text.is_empty() {
        text.push('\n');
    }
    std::fs::write(paths.state.join("tags"), text)
        .map_err(|error| Error::apply("writing the tags", error))?;

    if remove {
        out.result(Mark::Ok, &format!("{name} removed"));
    } else {
        out.result(
            Mark::Added,
            &format!("{name} set · `if niwa.machine.tags.{name}` now answers true here"),
        );
    }
    Ok(ExitCode::SUCCESS)
}

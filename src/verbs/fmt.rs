//! `niwa fmt`: normalize the config files, conservatively. niwa
//! writes to your config, so machine-written lines and yours must
//! share one style; this is the style.

use std::process::ExitCode;

use crate::error::Error;
use crate::out::{Mark, Out, count};
use crate::paths::Paths;

pub fn run(out: &Out) -> ExitCode {
    match fmt(out) {
        Ok(code) => code,
        Err(error) => {
            out.error(&error);
            ExitCode::FAILURE
        }
    }
}

fn fmt(out: &Out) -> Result<ExitCode, Error> {
    let paths = Paths::resolve()?;
    if !paths.config.join("init.luau").is_file() {
        return Err(Error::ConfigMissing { dir: paths.config });
    }

    let mut files = vec![paths.config.join("init.luau")];
    for dir in ["modules", "hosts"] {
        if let Ok(entries) = std::fs::read_dir(paths.config.join(dir)) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path
                    .extension()
                    .is_some_and(|extension| extension == "luau")
                {
                    files.push(path);
                }
            }
        }
    }
    files.sort();

    let mut formatted = 0usize;
    let mut untouched = 0usize;
    for path in files {
        let text = std::fs::read_to_string(&path).map_err(|error| Error::Apply {
            doing: format!("reading {}", path.display()),
            detail: error.to_string(),
        })?;
        match crate::luaufmt::format(&text) {
            Some(clean) => {
                std::fs::write(&path, clean).map_err(|error| Error::Apply {
                    doing: format!("writing {}", path.display()),
                    detail: error.to_string(),
                })?;
                formatted += 1;
            }
            None => untouched += 1,
        }
    }

    out.result(
        Mark::Ok,
        &format!(
            "{} formatted · {} already clean",
            count(formatted, "file"),
            count(untouched, "file")
        ),
    );
    Ok(ExitCode::SUCCESS)
}

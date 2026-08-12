//! `niwa uninstall`: remove niwa, and leave the machine exactly as it
//! stands. There is no "undo everything you ever did" button, because
//! that is a bomb with a friendly label. The journal and its archives
//! stay unless `--purge` says otherwise — deleting your undo history
//! should never be a side effect.

use std::process::ExitCode;

use crate::error::Error;
use crate::out::{Mark, Out};
use crate::paths::Paths;

pub fn run(out: &Out, purge: bool) -> ExitCode {
    match uninstall(out, purge) {
        Ok(code) => code,
        Err(error) => {
            out.error(&error);
            ExitCode::FAILURE
        }
    }
}

fn uninstall(out: &Out, purge: bool) -> Result<ExitCode, Error> {
    let paths = Paths::resolve()?;

    // The watcher first, so nothing re-launches a binary that is
    // about to vanish.
    crate::watch::remove(&paths);
    out.result(Mark::Ok, "the watcher is unloaded and its plist removed");

    // The shipped types.
    let types = paths.data.join("niwa");
    if types.exists() {
        let _ = std::fs::remove_dir_all(&types);
        out.result(Mark::Ok, "the shared data is removed");
    }

    if purge {
        if paths.state.exists() {
            std::fs::remove_dir_all(&paths.state).map_err(|error| Error::Apply {
                doing: "purging the journal".to_string(),
                detail: error.to_string(),
            })?;
        }
        out.result(Mark::Ok, "the journal and its archives are purged");
    } else {
        out.note("the journal and undo archives stay; add --purge to remove them");
    }

    // The binary last: removing the running file is safe on this
    // platform, and everything above already happened.
    let binary = std::env::current_exe().map_err(|error| Error::Apply {
        doing: "finding the niwa binary".to_string(),
        detail: error.to_string(),
    })?;
    std::fs::remove_file(&binary).map_err(|error| Error::Apply {
        doing: format!("removing {}", binary.display()),
        detail: error.to_string(),
    })?;
    out.result(
        Mark::Ok,
        &format!(
            "{} is removed · the machine stands as it is",
            binary.display()
        ),
    );
    out.note("the config repo is yours and stays where it is");
    Ok(ExitCode::SUCCESS)
}

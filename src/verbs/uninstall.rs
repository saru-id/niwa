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
    super::finish(out, uninstall(out, purge))
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
            std::fs::remove_dir_all(&paths.state)
                .map_err(|error| Error::apply("purging the journal", error))?;
        }
        out.result(Mark::Ok, "the journal and its archives are purged");
    } else {
        out.note("the journal and undo archives stay; add --purge to remove them");
    }

    // The PATH line the installer wrote, removed by its marker; the
    // rest of the rc file is the person's.
    let rc = std::env::var_os("ZDOTDIR")
        .map_or_else(|| paths.home.clone(), std::path::PathBuf::from)
        .join(".zshrc");
    if let Ok(text) = std::fs::read_to_string(&rc)
        && text.contains("# added by niwa")
    {
        let mut kept = String::new();
        for line in text
            .lines()
            .filter(|line| !line.contains("# added by niwa"))
        {
            kept.push_str(line);
            kept.push('\n');
        }
        if crate::util::write_atomic(&rc, kept.as_bytes(), None, false).is_ok() {
            out.result(Mark::Ok, "the PATH line the installer wrote is removed");
        }
    }

    // The binary last: removing the running file is safe on this
    // platform, and everything above already happened.
    let binary =
        std::env::current_exe().map_err(|error| Error::apply("finding the niwa binary", error))?;
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

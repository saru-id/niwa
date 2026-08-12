//! The watcher's launchd job: the same binary, invoked with
//! `check --notify` when the preferences or the config move. There is
//! no daemon and no state — the job's whole body is one shell of the
//! CLI, and its whole vocabulary is notify.

use std::path::PathBuf;

use crate::error::Error;
use crate::paths::Paths;

pub const LABEL: &str = "rs.niwa.watcher";

fn plist_path(paths: &Paths) -> PathBuf {
    crate::services::agent_plist(paths, LABEL)
}

/// Write the watcher's plist and load it. `init` calls this; the
/// installer's first apply reaches it through init.
pub fn install(paths: &Paths) -> Result<(), Error> {
    let binary = std::env::current_exe().map_err(|error| Error::Apply {
        doing: "finding the niwa binary".to_string(),
        detail: error.to_string(),
    })?;

    let mut dict = plist::Dictionary::new();
    dict.insert("Label".to_string(), plist::Value::String(LABEL.to_string()));
    dict.insert(
        "ProgramArguments".to_string(),
        plist::Value::Array(vec![
            plist::Value::String(binary.display().to_string()),
            plist::Value::String("check".to_string()),
            plist::Value::String("--notify".to_string()),
        ]),
    );
    dict.insert(
        "WatchPaths".to_string(),
        plist::Value::Array(vec![
            plist::Value::String(paths.config.display().to_string()),
            plist::Value::String(paths.home.join("Library/Preferences").display().to_string()),
        ]),
    );
    // The five-second debounce the design names: launchd holds
    // repeated events for this long before the next start.
    dict.insert(
        "ThrottleInterval".to_string(),
        plist::Value::Integer(5.into()),
    );

    let target = plist_path(paths);
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|error| Error::Apply {
            doing: "creating the agents directory".to_string(),
            detail: error.to_string(),
        })?;
    }
    let mut bytes = Vec::new();
    plist::Value::Dictionary(dict)
        .to_writer_xml(&mut bytes)
        .map_err(|error| Error::Apply {
            doing: "rendering the watcher's plist".to_string(),
            detail: error.to_string(),
        })?;
    crate::util::write_atomic(&target, &bytes, None, false).map_err(|error| Error::Apply {
        doing: "writing the watcher's plist".to_string(),
        detail: error.to_string(),
    })?;
    crate::services::bootstrap(paths, LABEL, false);
    Ok(())
}

/// Unload and delete the watcher's job, for uninstall.
pub fn remove(paths: &Paths) {
    crate::services::bootout(paths, LABEL);
    let _ = std::fs::remove_file(plist_path(paths));
}

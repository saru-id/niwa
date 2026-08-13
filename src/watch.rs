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

/// The job, described: what launchd is asked to run, when.
fn job(paths: &Paths, binary: &std::path::Path) -> plist::Dictionary {
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
    // The timer the design names beside the watch paths: a weekly
    // firing carries the rot survey and doctor's cheap subset, so a
    // quiet machine still gets its digest.
    let mut weekly = plist::Dictionary::new();
    weekly.insert("Weekday".to_string(), plist::Value::Integer(1.into()));
    weekly.insert("Hour".to_string(), plist::Value::Integer(9.into()));
    dict.insert(
        "StartCalendarInterval".to_string(),
        plist::Value::Dictionary(weekly),
    );
    dict
}

/// Write the watcher's plist and load it. `init` calls this; the
/// installer's first apply reaches it through init.
pub fn install(paths: &Paths) -> Result<(), Error> {
    let binary =
        std::env::current_exe().map_err(|error| Error::apply("finding the niwa binary", error))?;
    let dict = job(paths, &binary);
    let target = plist_path(paths);
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| Error::apply("creating the agents directory", error))?;
    }
    let mut bytes = Vec::new();
    plist::Value::Dictionary(dict)
        .to_writer_xml(&mut bytes)
        .map_err(|error| Error::apply("rendering the watcher's plist", error))?;
    crate::util::write_atomic(&target, &bytes, None, false)
        .map_err(|error| Error::apply("writing the watcher's plist", error))?;
    crate::services::bootstrap(paths, LABEL, false);
    Ok(())
}

/// Unload and delete the watcher's job, for uninstall.
pub fn remove(paths: &Paths) {
    crate::services::bootout(paths, LABEL);
    let _ = std::fs::remove_file(plist_path(paths));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_job_description_carries_the_designed_plist() {
        let home = tempfile::tempdir().unwrap();
        let paths = Paths {
            home: home.path().to_path_buf(),
            config: home.path().join(".config/niwa"),
            state: home.path().join(".local/state/niwa"),
            brew_prefix: home.path().join("brew"),
            data: home.path().join(".local/share"),
        };
        let dict = job(&paths, std::path::Path::new("/opt/niwa/bin/niwa"));
        let arguments: Vec<&str> = dict["ProgramArguments"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(plist::Value::as_string)
            .collect();
        assert_eq!(&arguments[1..], ["check", "--notify"]);
        let watched: Vec<&str> = dict["WatchPaths"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(plist::Value::as_string)
            .collect();
        assert_eq!(
            watched,
            [
                paths.config.display().to_string(),
                home.path()
                    .join("Library/Preferences")
                    .display()
                    .to_string()
            ]
        );
        assert_eq!(dict["ThrottleInterval"].as_signed_integer(), Some(5));
        let weekly = dict["StartCalendarInterval"].as_dictionary().unwrap();
        assert_eq!(weekly["Weekday"].as_signed_integer(), Some(1));
        assert_eq!(weekly["Hour"].as_signed_integer(), Some(9));
    }
}

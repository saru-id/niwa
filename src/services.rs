//! Launchd services: agents you declare, and Homebrew's daemons.
//!
//! A declared service's plist is owned like a file: niwa generates it,
//! compares it semantically against what is on disk, archives what it
//! replaces, and drift inside it is drift like any other. launchctl is
//! asked to load and unload, always on a deadline. Homebrew services
//! are checked through the plists Homebrew installs and driven through
//! `brew services`.

use std::path::PathBuf;
use std::time::Duration;

use crate::model::{Declaration, Value};
use crate::paths::Paths;
use crate::util::proc::bounded_output;

/// launchctl answers in milliseconds or is wedged; thirty seconds is
/// generous without letting a hung daemon stall the whole apply.
const LAUNCHCTL_DEADLINE: Duration = Duration::from_secs(30);

/// Where a declared agent's plist lives.
pub fn agent_plist(paths: &Paths, label: &str) -> PathBuf {
    paths
        .home
        .join("Library/LaunchAgents")
        .join(format!("{label}.plist"))
}

/// Where Homebrew puts a started service's plist.
pub fn brew_service_plist(paths: &Paths, name: &str) -> PathBuf {
    // Tap-qualified names install under the formula's own tail.
    let name = name.rsplit('/').next().unwrap_or(name);
    paths
        .home
        .join("Library/LaunchAgents")
        .join(format!("homebrew.mxcl.{name}.plist"))
}

/// Build the plist a declaration describes. `~` in the program and
/// log paths expands here, because launchd does not expand anything.
pub fn render(paths: &Paths, declaration: &Declaration) -> Option<plist::Dictionary> {
    let Value::Map(fields) = &declaration.spec else {
        return None;
    };
    let mut dict = plist::Dictionary::new();
    dict.insert(
        "Label".to_string(),
        plist::Value::String(declaration.identity.key.clone()),
    );

    let Some(Value::List(program)) = fields.get("program") else {
        return None;
    };
    let arguments: Vec<plist::Value> = program
        .iter()
        .filter_map(|item| match item {
            Value::Str(argument) => Some(plist::Value::String(expand(paths, argument))),
            _ => None,
        })
        .collect();
    dict.insert(
        "ProgramArguments".to_string(),
        plist::Value::Array(arguments),
    );

    if let Some(Value::Str(interval)) = fields.get("interval")
        && let Some(duration) = crate::util::parse_duration(interval)
    {
        #[allow(
            clippy::cast_possible_wrap,
            reason = "validated durations are far below the wrap point"
        )]
        dict.insert(
            "StartInterval".to_string(),
            plist::Value::Integer((duration.as_secs() as i64).into()),
        );
    }
    if let Some(Value::Map(calendar)) = fields.get("calendar") {
        let mut entry = plist::Dictionary::new();
        for (key, value) in calendar {
            let launchd_key = match key.as_str() {
                "minute" => "Minute",
                "hour" => "Hour",
                "day" => "Day",
                "weekday" => "Weekday",
                _ => continue,
            };
            if let Value::Int(number) = value {
                entry.insert(
                    launchd_key.to_string(),
                    plist::Value::Integer((*number).into()),
                );
            }
        }
        dict.insert(
            "StartCalendarInterval".to_string(),
            plist::Value::Dictionary(entry),
        );
    }
    if matches!(fields.get("keepalive"), Some(Value::Bool(true))) {
        dict.insert("KeepAlive".to_string(), plist::Value::Boolean(true));
    }

    if let Some(Value::Str(logs)) = fields.get("logs") {
        let dir = expand(paths, logs);
        let dir = dir.trim_end_matches('/');
        dict.insert(
            "StandardOutPath".to_string(),
            plist::Value::String(format!("{dir}/out.log")),
        );
        dict.insert(
            "StandardErrorPath".to_string(),
            plist::Value::String(format!("{dir}/err.log")),
        );
    }
    Some(dict)
}

fn expand(paths: &Paths, path: &str) -> String {
    paths.expand_home(path).display().to_string()
}

/// Does the plist on disk say what the declaration says? Compared as
/// parsed values, so formatting differences do not read as drift.
pub fn agent_in_sync(paths: &Paths, declaration: &Declaration) -> Option<bool> {
    let declared = render(paths, declaration)?;
    let on_disk = plist::Value::from_file(agent_plist(paths, &declaration.identity.key)).ok()?;
    Some(on_disk.as_dictionary() == Some(&declared))
}

/// The gui domain target for this user, from the home directory's
/// owner. No process asked, nothing unsafe.
fn gui_target(paths: &Paths) -> Option<String> {
    use std::os::unix::fs::MetadataExt as _;
    let uid = std::fs::metadata(&paths.home).ok()?.uid();
    Some(format!("gui/{uid}"))
}

/// Load (or reload) an agent after its plist changed. A bootout of a
/// service that was never loaded fails, and that is fine.
pub fn bootstrap(paths: &Paths, label: &str, reload: bool) {
    let Some(target) = gui_target(paths) else {
        return;
    };
    let plist = agent_plist(paths, label).display().to_string();
    if reload {
        let _ = bounded_output(
            "launchctl",
            &["bootout", &format!("{target}/{label}")],
            LAUNCHCTL_DEADLINE,
        );
    }
    let _ = bounded_output(
        "launchctl",
        &["bootstrap", &target, &plist],
        LAUNCHCTL_DEADLINE,
    );
    if reload {
        let _ = bounded_output(
            "launchctl",
            &["kickstart", "-k", &format!("{target}/{label}")],
            LAUNCHCTL_DEADLINE,
        );
    }
}

/// Unload an agent, for undo and removal.
pub fn bootout(paths: &Paths, label: &str) {
    if let Some(target) = gui_target(paths) {
        let _ = bounded_output(
            "launchctl",
            &["bootout", &format!("{target}/{label}")],
            LAUNCHCTL_DEADLINE,
        );
    }
}

/// Start a Homebrew service; brew writes the plist that the check
/// reads back.
pub fn brew_service_start(name: &str) -> crate::util::proc::Invocation {
    crate::util::proc::invoke("brew", &["services", "start", name], Duration::from_mins(5))
}

/// Stop and unregister a Homebrew service, for undo.
pub fn brew_service_stop(name: &str) -> Result<(), String> {
    crate::util::proc::run_ok("brew", &["services", "stop", name], Duration::from_mins(5))
}

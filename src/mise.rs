//! mise toolchains, read through mise's install directories.
//!
//! A tool counts as present when any version of it is installed; which
//! version a spec like `lts` resolves to is the lockfile's business,
//! in a later milestone. mise itself is invoked only to change things.

use std::path::PathBuf;
use std::time::Duration;

use crate::model::{Declaration, Value};
use crate::paths::Paths;

fn installs(paths: &Paths) -> PathBuf {
    paths.data.join("mise/installs")
}

/// Is any version of this tool installed? Returns the newest install
/// directory's name when one is.
pub fn installed(paths: &Paths, tool: &str) -> Option<String> {
    crate::util::newest_version_dir(&installs(paths).join(tool), |_| true)
}

/// The `tool@version` argument one declaration asks for. A locked
/// version wins over the spec: machine two gets your version, not
/// whatever the spec resolves to today.
pub fn request(declaration: &Declaration, pinned: Option<&str>) -> String {
    let tool = &declaration.identity.key;
    if let Some(version) = pinned {
        return format!("{tool}@{version}");
    }
    match &declaration.spec {
        Value::Map(fields) => match fields.get("version") {
            Some(Value::Str(version)) => format!("{tool}@{version}"),
            _ => tool.clone(),
        },
        _ => tool.clone(),
    }
}

/// What a version spec resolves to right now, for `niwa update`.
pub fn latest(tool: &str, spec: Option<&str>) -> Option<String> {
    let request = spec.map_or_else(|| tool.to_string(), |spec| format!("{tool}@{spec}"));
    crate::util::proc::bounded_stdout("mise", &["latest", &request], Duration::from_mins(1))
        .filter(|version| !version.is_empty())
}

/// Install a batch in one `mise use --global` invocation.
pub fn install(requests: &[String], deadline: Duration) -> crate::util::proc::Invocation {
    let mut args: Vec<&str> = vec!["use", "--global"];
    args.extend(requests.iter().map(String::as_str));
    crate::util::proc::invoke("mise", &args, deadline)
}

/// Take a tool back out of the global config, for undo. The installed
/// versions stay on disk; undo reverses what the run declared, not
/// what it downloaded.
pub fn unuse(tool: &str, deadline: Duration) -> Result<(), String> {
    crate::util::proc::run_ok("mise", &["unuse", "--global", tool], deadline)
}

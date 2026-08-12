//! mise toolchains, read through mise's install directories.
//!
//! A tool counts as present when any version of it is installed; which
//! version a spec like `lts` resolves to is the lockfile's business,
//! in a later milestone. mise itself is invoked only to change things.

use std::path::PathBuf;
use std::time::Duration;

use crate::model::{Declaration, Value};
use crate::paths::Paths;
use crate::util::proc::bounded_output;

fn installs(paths: &Paths) -> PathBuf {
    paths.data.join("mise/installs")
}

/// Is any version of this tool installed? Returns the newest install
/// directory's name when one is.
pub fn installed(paths: &Paths, tool: &str) -> Option<String> {
    let mut versions: Vec<String> = std::fs::read_dir(installs(paths).join(tool))
        .ok()?
        .flatten()
        .filter(|entry| entry.path().is_dir())
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .filter(|name| !name.starts_with('.'))
        .collect();
    versions.sort();
    versions.pop()
}

/// The `tool@version` argument one declaration asks for.
pub fn request(declaration: &Declaration) -> String {
    let tool = &declaration.identity.key;
    match &declaration.spec {
        Value::Map(fields) => match fields.get("version") {
            Some(Value::Str(version)) => format!("{tool}@{version}"),
            _ => tool.clone(),
        },
        _ => tool.clone(),
    }
}

/// Install a batch in one `mise use --global` invocation.
pub fn install(requests: &[String], deadline: Duration) -> crate::brew::Invocation {
    let mut args: Vec<&str> = vec!["use", "--global"];
    args.extend(requests.iter().map(String::as_str));
    let command = format!("mise {}", args.join(" "));
    match bounded_output("mise", &args, deadline) {
        Some(finished) => crate::brew::Invocation {
            command,
            code: finished.code,
            stderr_tail: finished.stderr_tail,
        },
        None => crate::brew::Invocation {
            command,
            code: None,
            stderr_tail: "mise did not finish inside the deadline, or is not installed".to_string(),
        },
    }
}

/// Take a tool back out of the global config, for undo. The installed
/// versions stay on disk; undo reverses what the run declared, not
/// what it downloaded.
pub fn unuse(tool: &str, deadline: Duration) -> Result<(), String> {
    match bounded_output("mise", &["unuse", "--global", tool], deadline) {
        Some(finished) if finished.code == Some(0) => Ok(()),
        Some(finished) => Err(finished.stderr_tail),
        None => Err("mise did not finish inside the deadline, or is not installed".to_string()),
    }
}

//! npm globals, read through the global `node_modules` tree.
//!
//! The one thing npm is asked is where that tree lives (`npm root -g`),
//! once per process; presence is then a directory check, which is both
//! faster and more truthful than `npm ls`.

use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::Duration;

use crate::util::proc::bounded_stdout;

static ROOT: OnceLock<Option<PathBuf>> = OnceLock::new();

fn root() -> Option<&'static PathBuf> {
    ROOT.get_or_init(|| {
        bounded_stdout("npm", &["root", "-g"], Duration::from_secs(10)).map(PathBuf::from)
    })
    .as_ref()
}

/// Is this package in the global tree? Scoped names nest naturally
/// (`@biomejs/biome` is a directory under a directory).
pub fn installed(name: &str) -> bool {
    root().is_some_and(|root| root.join(name).join("package.json").is_file())
}

/// Install a batch in one npm invocation. Returns what was run and
/// what npm said, for the failure screen.
pub fn install(names: &[String], deadline: Duration) -> crate::util::proc::Invocation {
    let mut args: Vec<&str> = vec!["install", "-g"];
    args.extend(names.iter().map(String::as_str));
    crate::util::proc::invoke("npm", &args, deadline)
}

/// Uninstall one global package, for undo.
pub fn uninstall(name: &str, deadline: Duration) -> Result<(), String> {
    crate::util::proc::run_ok("npm", &["uninstall", "-g", name], deadline)
}

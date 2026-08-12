//! Homebrew, read through receipts.
//!
//! Detection never asks brew what is installed: every install leaves a
//! receipt on disk — `Cellar/<name>/<version>/INSTALL_RECEIPT.json`
//! for formulae, `Caskroom/<token>/` for casks — and reading those is
//! both faster and more truthful than shelling out. brew itself is
//! invoked only to change the machine, always on a deadline.

use std::path::Path;
use std::time::Duration;

use crate::model::Kind;
use crate::paths::Paths;
use crate::util::proc::Invocation;

/// Is this formula or cask installed? Returns the newest version
/// directory's name when it is. Presence is presence: a formula that
/// arrived as someone's dependency still satisfies a declaration.
pub fn installed(paths: &Paths, kind: &Kind, name: &str) -> Option<String> {
    let prefix = Path::new(&paths.brew_prefix);
    match kind {
        Kind::BrewFormula => {
            let cellar = prefix.join("Cellar").join(name);
            newest_version_dir(&cellar, |version| {
                version.join("INSTALL_RECEIPT.json").is_file()
            })
        }
        Kind::BrewCask => {
            let caskroom = prefix.join("Caskroom").join(name);
            newest_version_dir(&caskroom, |version| {
                !version
                    .file_name()
                    .is_some_and(|n| n.to_string_lossy().starts_with('.'))
            })
        }
        _ => None,
    }
}

fn newest_version_dir(root: &Path, valid: impl Fn(&Path) -> bool) -> Option<String> {
    let mut versions: Vec<String> = std::fs::read_dir(root)
        .ok()?
        .flatten()
        .filter(|entry| entry.path().is_dir() && valid(&entry.path()))
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .filter(|name| !name.starts_with('.'))
        .collect();
    versions.sort();
    versions.pop()
}

/// Formulae someone asked for by name, off their receipts. What came
/// along as a dependency never surfaces as a proposal.
pub fn requested_formulae(paths: &Paths) -> Vec<String> {
    let cellar = Path::new(&paths.brew_prefix).join("Cellar");
    let mut names = Vec::new();
    let Ok(entries) = std::fs::read_dir(&cellar) else {
        return names;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') || !entry.path().is_dir() {
            continue;
        }
        let requested = std::fs::read_dir(entry.path())
            .into_iter()
            .flatten()
            .flatten()
            .any(|version| {
                std::fs::read_to_string(version.path().join("INSTALL_RECEIPT.json"))
                    .ok()
                    .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
                    .and_then(|receipt| receipt.get("installed_on_request")?.as_bool())
                    .unwrap_or(false)
            });
        if requested {
            names.push(name);
        }
    }
    names.sort();
    names
}

/// Every cask in the Caskroom. Casks are always asked for by name.
pub fn installed_casks(paths: &Paths) -> Vec<String> {
    let caskroom = Path::new(&paths.brew_prefix).join("Caskroom");
    let mut names = Vec::new();
    let Ok(entries) = std::fs::read_dir(&caskroom) else {
        return names;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if !name.starts_with('.') && entry.path().is_dir() {
            names.push(name);
        }
    }
    names.sort();
    names
}

/// Uninstall one package, for undo. Returns the failure detail when
/// brew objects.
pub fn uninstall(kind: &Kind, name: &str, deadline: Duration) -> Result<(), String> {
    let mut args: Vec<&str> = vec!["uninstall"];
    if matches!(kind, Kind::BrewCask) {
        args.push("--cask");
    }
    args.push(name);
    crate::util::proc::run_ok("brew", &args, deadline)
}

/// Install a batch in one brew invocation. The caller reads receipts
/// afterwards for the per-name truth; this only reports what was run
/// and what brew said.
pub fn install(kind: &Kind, names: &[String], deadline: Duration) -> Invocation {
    let mut args: Vec<&str> = vec!["install"];
    if matches!(kind, Kind::BrewCask) {
        args.push("--cask");
    }
    args.extend(names.iter().map(String::as_str));
    crate::util::proc::invoke("brew", &args, deadline)
}

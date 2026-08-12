//! `niwa doctor`: is the safety net real? A net you cannot verify is
//! a decoration, so this one answers for itself: the journal reads,
//! the archives open, the secrets resolve, the lockfile agrees, and
//! the watcher is where it should be. `--deep` pays for the expensive
//! versions.

use std::process::ExitCode;

use crate::error::Error;
use crate::journal::Journal;
use crate::model::Kind;
use crate::out::{Mark, Out};
use crate::paths::Paths;

pub fn run(out: &Out, deep: bool) -> ExitCode {
    super::finish(out, doctor(out, deep))
}

fn doctor(out: &Out, deep: bool) -> Result<ExitCode, Error> {
    let paths = Paths::resolve()?;
    let mut healthy = true;

    // The journal: readable, at a schema this niwa speaks.
    match Journal::load(&paths.state) {
        Ok(_) => out.result(Mark::Ok, "the journal reads at its schema"),
        Err(error) => {
            healthy = false;
            out.result(Mark::Failed, &format!("the journal: {error}"));
        }
    }

    healthy &= archives_check(out, &paths, deep);

    // The config: loads, lints, gates.
    let analysis = match super::run_pass(&paths, None) {
        Ok(analysis) => {
            out.result(Mark::Ok, "the config loads clean");
            Some(analysis)
        }
        Err(error) => {
            healthy = false;
            out.result(Mark::Failed, &format!("the config: {error}"));
            None
        }
    };

    // Secrets: every one the config asks for resolves somewhere.
    if let Some(secrets) = super::secrets_used(&paths) {
        for (name, from) in secrets {
            match crate::secrets::exists(&paths, &name, from.as_deref()) {
                Ok(()) => out.result(Mark::Ok, &format!("the secret {name} resolves")),
                Err(places) => {
                    healthy = false;
                    out.result(
                        Mark::Failed,
                        &format!("the secret {name} was not found in {}", places.join(", ")),
                    );
                }
            }
        }
    }

    if let Some(analysis) = &analysis {
        healthy &= lockfile_check(out, &paths, analysis);
    }

    // The watcher: honest about not being wired yet.
    let watcher = paths
        .home
        .join("Library/LaunchAgents/rs.niwa.watcher.plist");
    if watcher.is_file() {
        out.result(Mark::Ok, "the watcher's agent is installed");
    } else {
        out.note("the watcher is not installed; niwa init wires it");
    }

    Ok(if healthy {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    })
}

/// Present archive files must be readable; sealed ones must decrypt
/// when `--deep` pays for it.
fn archives_check(out: &Out, paths: &Paths, deep: bool) -> bool {
    let archive_root = paths.state.join("archive");
    let mut archived = 0usize;
    let mut unreadable = 0usize;
    let mut sealed_checked = 0usize;
    let mut sealed_broken = 0usize;
    if archive_root.is_dir() {
        for entry in walk(&archive_root) {
            archived += 1;
            match std::fs::read(&entry) {
                Ok(bytes) => {
                    if deep && crate::secrets::is_sealed(&bytes) {
                        sealed_checked += 1;
                        if crate::secrets::unseal(paths, &bytes).is_err() {
                            sealed_broken += 1;
                        }
                    }
                }
                Err(_) => unreadable += 1,
            }
        }
    }
    if unreadable > 0 || sealed_broken > 0 {
        out.result(
            Mark::Failed,
            &format!(
                "the archive: {unreadable} unreadable, {sealed_broken} sealed copies do not decrypt"
            ),
        );
        return false;
    }
    if deep {
        out.result(
            Mark::Ok,
            &format!("{archived} archived copies read · {sealed_checked} sealed ones decrypt"),
        );
    } else {
        out.result(Mark::Ok, &format!("{archived} archived copies read"));
    }
    true
}

/// Everything version-resolved must have its pin.
fn lockfile_check(out: &Out, paths: &Paths, analysis: &crate::model::analysis::Analysis) -> bool {
    let lock = crate::lockfile::Lockfile::load(paths).unwrap_or_default();
    let mut unpinned = Vec::new();
    for declaration in &analysis.effective {
        let key = &declaration.identity.key;
        let pinned = match &declaration.identity.kind {
            Kind::Mise => lock.mise.contains_key(key),
            Kind::GithubRelease => lock.github_release.contains_key(key),
            Kind::Use => lock.uses.contains_key(key),
            _ => continue,
        };
        if !pinned {
            unpinned.push(declaration.identity.to_string());
        }
    }
    if unpinned.is_empty() {
        out.result(Mark::Ok, "the lockfile agrees with the declarations");
        true
    } else {
        out.result(
            Mark::Failed,
            &format!(
                "unpinned in niwa.lock: {} · run niwa update",
                unpinned.join(", ")
            ),
        );
        false
    }
}

fn walk(dir: &std::path::Path) -> Vec<std::path::PathBuf> {
    let mut files = Vec::new();
    let Ok(entries) = std::fs::read_dir(dir) else {
        return files;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            files.extend(walk(&path));
        } else {
            files.push(path);
        }
    }
    files
}

/// The cheap half of doctor, for the watcher's weekly digest: how
/// many of the quick checks fail, with nothing printed. The
/// expensive checks stay behind `--deep` and a person's decision.
pub fn quiet_problems(paths: &Paths) -> usize {
    let mut problems = 0;
    if Journal::load(&paths.state).is_err() {
        problems += 1;
    }
    let archive_root = paths.state.join("archive");
    if archive_root.is_dir() {
        problems += walk(&archive_root)
            .iter()
            .filter(|file| std::fs::read(file).is_err())
            .count();
    }
    problems
}

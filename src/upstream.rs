//! Config rot: what you declare can vanish upstream without anything
//! failing here. `check --upstream` asks the upstreams that can be
//! asked; the watcher does it weekly and caches the digest, so the
//! dashboard renders a warm answer instead of making you wait on the
//! network.

use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::lockfile::Lockfile;
use crate::model::{Declaration, Kind};
use crate::paths::Paths;
use crate::util::proc::{bounded_output, bounded_stdout};

/// The weekly digest, cached beside the journal.
#[derive(Debug, Default, Serialize, Deserialize)]
pub struct Digest {
    /// When it was computed.
    pub when: String,
    /// `brew outdated` count, for the dashboard's warm line.
    pub brew_outdated: usize,
    /// Pins in niwa.lock with a newer release upstream.
    pub lock_outdated: usize,
    /// Declared things that no longer exist upstream.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub missing: Vec<String>,
}

impl Digest {
    pub fn load(paths: &Paths) -> Option<Self> {
        let text = std::fs::read_to_string(paths.state.join("digest.json")).ok()?;
        serde_json::from_str(&text).ok()
    }

    pub fn save(&self, paths: &Paths) {
        let _ = std::fs::create_dir_all(&paths.state);
        if let Ok(text) = serde_json::to_string_pretty(self) {
            let _ = crate::util::write_atomic(
                &paths.state.join("digest.json"),
                text.as_bytes(),
                None,
                false,
            );
        }
    }

    /// A digest older than a week is due again.
    pub fn is_stale(&self) -> bool {
        self.when.parse::<jiff::Timestamp>().map_or(true, |when| {
            (jiff::Timestamp::now() - when).get_seconds() > 7 * 24 * 60 * 60
        })
    }
}

/// One rot finding: what is gone, and where it was asked.
pub struct Missing {
    pub identity: String,
    pub detail: String,
}

/// Ask every upstream that can be asked whether the declared things
/// still exist. Absent tools are named and skipped, never guessed at.
pub fn survey(
    declarations: &[Declaration],
    lock: &Lockfile,
    skipped: &mut Vec<String>,
) -> Vec<Missing> {
    let mut missing = Vec::new();
    ask_brew(declarations, &mut missing, skipped);
    ask_npm(declarations, &mut missing, skipped);
    ask_github(lock, &mut missing, skipped);
    missing
}

/// Ask the brew provider per kind; brew's own error names the
/// ghosts.
fn ask_brew(declarations: &[Declaration], missing: &mut Vec<Missing>, skipped: &mut Vec<String>) {
    for kind in [Kind::BrewFormula, Kind::BrewCask] {
        let names: Vec<&str> = declarations
            .iter()
            .filter(|declaration| declaration.identity.kind == kind)
            .map(|declaration| declaration.identity.key.as_str())
            .collect();
        if names.is_empty() {
            continue;
        }
        match crate::brew::exists_upstream(&kind, &names, Duration::from_mins(2)) {
            None => skipped.push(format!(
                "brew is not reachable · {kind} names were not checked"
            )),
            Some(ghosts) => missing.extend(ghosts.into_iter().map(|name| Missing {
                identity: format!("{kind}:{name}"),
                detail: "brew no longer knows it".to_string(),
            })),
        }
    }
}

fn ask_npm(declarations: &[Declaration], missing: &mut Vec<Missing>, skipped: &mut Vec<String>) {
    for declaration in declarations {
        if declaration.identity.kind != Kind::Npm {
            continue;
        }
        let name = &declaration.identity.key;
        match crate::npm::exists_upstream(name, Duration::from_mins(1)) {
            None => {
                skipped.push("npm is not reachable · packages were not checked".to_string());
                return;
            }
            Some(false) => missing.push(Missing {
                identity: format!("npm:{name}"),
                detail: "the registry no longer knows it".to_string(),
            }),
            Some(true) => {}
        }
    }
}

/// Pinned releases and shared modules: the repository must still
/// answer. `curl` asks; a 404 is a ghost, an unreachable network is
/// honestly skipped.
fn ask_github(lock: &Lockfile, missing: &mut Vec<Missing>, skipped: &mut Vec<String>) {
    let repos: Vec<(String, String)> = lock
        .github_release
        .keys()
        .map(|repo| (format!("github_release:{repo}"), repo.clone()))
        .chain(lock.uses.keys().map(|name| {
            let repo = name
                .strip_prefix("github:")
                .unwrap_or(name)
                .split('@')
                .next()
                .unwrap_or_default()
                .to_string();
            (format!("use:{name}"), repo)
        }))
        .collect();
    for (identity, repo) in repos {
        let url = format!("https://api.github.com/repos/{repo}");
        let Some(finished) = bounded_output(
            "curl",
            &["-fsSL", "--max-time", "30", "-o", "/dev/null", &url],
            Duration::from_mins(1),
        ) else {
            skipped.push("curl is not reachable · repositories were not checked".to_string());
            return;
        };
        match finished.code {
            Some(0) => {}
            Some(22) => missing.push(Missing {
                identity,
                detail: "the repository is gone".to_string(),
            }),
            // Network trouble is not a finding; say nothing was
            // learned rather than inventing rot.
            _ => skipped.push(format!("{repo} could not be reached · not checked")),
        }
    }
}

/// The dashboard's outdated line: brew's own count, and the lockfile
/// pins a newer release exists for.
pub fn outdated_counts(lock: &Lockfile) -> (usize, usize) {
    let brew = bounded_stdout("brew", &["outdated", "--quiet"], Duration::from_mins(2)).map_or(
        0,
        |stdout| {
            stdout
                .lines()
                .filter(|line| !line.trim().is_empty())
                .count()
        },
    );
    let mut lock_outdated = 0;
    for (repo, pin) in &lock.github_release {
        if let Some(latest) = crate::release::latest_version(repo)
            && latest.trim_start_matches('v') != pin.version.trim_start_matches('v')
        {
            lock_outdated += 1;
        }
    }
    (brew, lock_outdated)
}

/// Refresh the weekly digest: outdated counts plus the upstream
/// survey, cached for the dashboard's warm answer.
pub fn refresh(paths: &Paths, declarations: &[Declaration], lock: &Lockfile) -> Digest {
    let mut skipped = Vec::new();
    let missing = survey(declarations, lock, &mut skipped);
    let (brew_outdated, lock_outdated) = outdated_counts(lock);
    let digest = Digest {
        when: jiff::Timestamp::now().to_string(),
        brew_outdated,
        lock_outdated,
        missing: missing
            .into_iter()
            .map(|finding| format!("{} · {}", finding.identity, finding.detail))
            .collect(),
    };
    digest.save(paths);
    digest
}

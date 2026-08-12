//! Drift: actual against acknowledged, and the two honest kinds of
//! "unmanaged" niwa can enumerate.
//!
//! Four findings come out of a survey. A governed file whose live
//! bytes moved is a live edit that `pull` brings home. A governed
//! preference whose value moved is an in-place config edit waiting to
//! be accepted. A package with a receipt but no declaration is an
//! addition proposal. A declaration that vanished from the config
//! while its work is still on the machine is an orphan, and removal
//! is an offer, never an automatic. What was answered "never" stays
//! answered.
//!
//! Flips in System Settings domains that the config does not govern
//! are found by comparing against a baseline kept in the state
//! directory: keys never seen before are learned silently, and only a
//! change to a known key becomes a proposal. That filter is the
//! difference between a tool that informs and a firehose.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::journal::{Journal, digest};
use crate::model::{Declaration, Kind, Value};
use crate::paths::Paths;

/// The System Settings domains the watcher volunteers proposals for,
/// beyond whatever the config already touches. Deliberately short.
const SETTINGS_DOMAINS: [&str; 8] = [
    "com.apple.dock",
    "com.apple.finder",
    "NSGlobalDomain",
    "com.apple.AppleMultitouchTrackpad",
    "com.apple.WindowManager",
    "com.apple.screencapture",
    "com.apple.symbolichotkeys",
    "com.apple.controlcenter",
];

pub enum Finding {
    /// A governed, source-backed file whose live bytes moved: `pull`
    /// copies them home to the repo.
    LiveEdit {
        target: String,
        source: String,
        lines_changed: usize,
    },
    /// A governed rendered file whose bytes moved. One way by design:
    /// the fix is the template, and pull refuses it by name.
    RenderedDrift { target: String, provenance: String },
    /// A governed preference whose live value moved: an in-place edit
    /// of the declaration that owns it.
    ValueDrift {
        domain: String,
        key: String,
        live: Value,
        declared: Value,
        provenance: crate::model::Provenance,
    },
    /// An ungoverned key in a watched domain changed against the
    /// baseline: a new config line, placed by domain.
    SettingsFlip {
        domain: String,
        key: String,
        live: Value,
    },
    /// A package with a receipt and no declaration: a new config
    /// line, placed by provider.
    UnmanagedPackage { kind: Kind, name: String },
    /// Acknowledged and still on the machine, but no longer declared:
    /// the removal offer.
    Orphan { identity: String },
}

impl Finding {
    /// The stable key a "never" is remembered under: the exact
    /// proposal, value included, so a different value asks again.
    pub fn decline_key(&self) -> String {
        match self {
            Self::LiveEdit { target, .. } => format!("pull:file:{target}"),
            Self::RenderedDrift { target, .. } => format!("pull:rendered:{target}"),
            Self::ValueDrift {
                domain, key, live, ..
            } => {
                format!("edit:defaults:{domain}:{key}={}", live.canonical())
            }
            Self::SettingsFlip { domain, key, live } => {
                format!("set:defaults:{domain}:{key}={}", live.canonical())
            }
            Self::UnmanagedPackage { kind, name } => format!("add:{kind}:{name}"),
            Self::Orphan { identity } => format!("remove:{identity}"),
        }
    }
}

impl Finding {
    /// The short name a notification carries.
    pub fn label(&self) -> String {
        match self {
            Self::LiveEdit { target, .. } => format!("{target} edited"),
            Self::RenderedDrift { target, .. } => format!("{target} drifted"),
            Self::ValueDrift { domain, key, .. } | Self::SettingsFlip { domain, key, .. } => {
                format!("{domain} {key} changed")
            }
            Self::UnmanagedPackage { name, .. } => format!("{name} installed by hand"),
            Self::Orphan { identity } => format!("{identity} no longer declared"),
        }
    }
}

/// What a survey saw, and the housekeeping it implies.
pub struct Survey {
    pub findings: Vec<Finding>,
    /// Acknowledgements whose resource is gone on both sides: dropped
    /// silently, per the truth table's ○○● row.
    pub stale_acknowledgements: Vec<String>,
}

/// The baseline for watched domains, kept beside the journal.
#[derive(Default, Serialize, Deserialize)]
pub struct Baseline {
    domains: BTreeMap<String, BTreeMap<String, Value>>,
}

const BASELINE_FILE: &str = "baseline.json";

impl Baseline {
    pub fn load(state: &Path) -> Self {
        std::fs::read(state.join(BASELINE_FILE))
            .ok()
            .and_then(|raw| serde_json::from_slice(&raw).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, state: &Path) {
        let _ = std::fs::create_dir_all(state);
        if let Ok(raw) = serde_json::to_vec_pretty(self) {
            let _ = crate::util::write_atomic(&state.join(BASELINE_FILE), &raw, None, false);
        }
    }

    fn known(&self, domain: &str, key: &str) -> Option<&Value> {
        self.domains.get(domain).and_then(|keys| keys.get(key))
    }

    /// Record what a key looks like now, so it is not proposed again
    /// until it moves again.
    pub fn learn(&mut self, domain: &str, key: &str, value: Value) {
        self.domains
            .entry(domain.to_string())
            .or_default()
            .insert(key.to_string(), value);
    }
}

/// Compare the machine with the journal and the declarations.
pub fn survey(
    paths: &Paths,
    journal: &Journal,
    declarations: &[Declaration],
    baseline: &mut Baseline,
) -> Survey {
    let mut findings = Vec::new();
    let mut stale = Vec::new();

    let declared_ids: std::collections::HashSet<String> = declarations
        .iter()
        .map(|declaration| declaration.identity.to_string())
        .collect();

    governed_drift(paths, journal, declarations, &mut findings);
    settings_flips(paths, declarations, baseline, journal, &mut findings);
    unmanaged_packages(paths, &declared_ids, journal, &mut findings);
    orphans(paths, journal, &declared_ids, &mut findings, &mut stale);

    findings.retain(|finding| !journal.is_declined(&finding.decline_key()));

    Survey {
        findings,
        stale_acknowledgements: stale,
    }
}

/// Live edits and value drift on governed identities. Drift is only
/// drift when the config and the journal agree; a changed spec is
/// pending work, and the plan owns that story.
fn governed_drift(
    paths: &Paths,
    journal: &Journal,
    declarations: &[Declaration],
    findings: &mut Vec<Finding>,
) {
    for declaration in declarations {
        let identity = declaration.identity.to_string();
        let Some(ack) = journal.acknowledged(&identity) else {
            continue;
        };
        if ack.spec != declaration.spec {
            continue;
        }
        match &declaration.identity.kind {
            Kind::File => {
                let Value::Map(fields) = &declaration.spec else {
                    continue;
                };
                let target = expand(paths, &declaration.identity.key);
                let Ok(live) = std::fs::read(&target) else {
                    continue;
                };
                if ack.bytes.as_deref() == Some(digest(&live).as_str()) {
                    continue;
                }
                match (fields.get("source"), fields.get("content")) {
                    (Some(Value::Str(source)), _) => {
                        let repo_bytes = source
                            .strip_prefix("@self/")
                            .and_then(|rest| std::fs::read(paths.config.join(rest)).ok())
                            .unwrap_or_default();
                        findings.push(Finding::LiveEdit {
                            target: declaration.identity.key.clone(),
                            source: source.clone(),
                            lines_changed: lines_differing(&repo_bytes, &live),
                        });
                    }
                    _ => findings.push(Finding::RenderedDrift {
                        target: declaration.identity.key.clone(),
                        provenance: declaration.provenance.to_string(),
                    }),
                }
            }
            Kind::Defaults => {
                let Some((domain, key)) = declaration.identity.key.split_once(':') else {
                    continue;
                };
                let Value::Map(fields) = &declaration.spec else {
                    continue;
                };
                let Some(declared) = fields.get("value") else {
                    continue;
                };
                let store = crate::defaults::domain_path(paths, domain);
                let live = plist::Value::from_file(&store).ok().and_then(|root| {
                    root.as_dictionary()
                        .and_then(|dict| dict.get(key))
                        .map(crate::defaults::plist_to_value)
                });
                if let Some(live) = live
                    && &live != declared
                {
                    findings.push(Finding::ValueDrift {
                        domain: domain.to_string(),
                        key: key.to_string(),
                        live,
                        declared: declared.clone(),
                        provenance: declaration.provenance.clone(),
                    });
                }
            }
            _ => {}
        }
    }
}

/// Flips in watched domains that nothing governs. Keys never seen are
/// learned silently; only movement on a known key proposes.
fn settings_flips(
    paths: &Paths,
    declarations: &[Declaration],
    baseline: &mut Baseline,
    journal: &Journal,
    findings: &mut Vec<Finding>,
) {
    let governed: std::collections::HashSet<String> = declarations
        .iter()
        .filter(|declaration| matches!(declaration.identity.kind, Kind::Defaults))
        .map(|declaration| declaration.identity.key.clone())
        .collect();

    let mut domains: Vec<String> = SETTINGS_DOMAINS.iter().map(ToString::to_string).collect();
    for declaration in declarations {
        if matches!(declaration.identity.kind, Kind::Defaults)
            && let Some((domain, _)) = declaration.identity.key.split_once(':')
            && !domain.starts_with('/')
            && !domains.iter().any(|known| known == domain)
        {
            domains.push(domain.to_string());
        }
    }

    for domain in &domains {
        let store = crate::defaults::domain_path(paths, domain);
        let Ok(root) = plist::Value::from_file(&store) else {
            continue;
        };
        let Some(dict) = root.as_dictionary() else {
            continue;
        };
        for (key, raw) in dict {
            let live = crate::defaults::plist_to_value(raw);
            match baseline.known(domain, key) {
                None => baseline.learn(domain, key, live),
                Some(known) if known == &live => {}
                Some(_) => {
                    let governed_key = format!("{domain}:{key}");
                    if governed.contains(&governed_key) {
                        // Governed keys drift through the journal;
                        // the baseline just keeps up.
                        baseline.learn(domain, key, live);
                        continue;
                    }
                    let finding = Finding::SettingsFlip {
                        domain: domain.clone(),
                        key: key.clone(),
                        live: live.clone(),
                    };
                    if journal.is_declined(&finding.decline_key()) {
                        // A refused flip still moves the baseline, or
                        // it would be refused on every survey forever.
                        baseline.learn(domain, key, live);
                    } else {
                        findings.push(finding);
                    }
                }
            }
        }
    }
}

/// Packages with receipts and no declaration. Requested formulae
/// only: dependencies never surface.
fn unmanaged_packages(
    paths: &Paths,
    declared: &std::collections::HashSet<String>,
    journal: &Journal,
    findings: &mut Vec<Finding>,
) {
    for name in crate::brew::requested_formulae(paths) {
        let identity = format!("brew.formula:{name}");
        if !declared.contains(&identity) && journal.acknowledged(&identity).is_none() {
            findings.push(Finding::UnmanagedPackage {
                kind: Kind::BrewFormula,
                name,
            });
        }
    }
    for name in crate::brew::installed_casks(paths) {
        let identity = format!("brew.cask:{name}");
        if !declared.contains(&identity) && journal.acknowledged(&identity).is_none() {
            findings.push(Finding::UnmanagedPackage {
                kind: Kind::BrewCask,
                name,
            });
        }
    }
}

/// Acknowledged but no longer declared: still present is an offer,
/// gone on both sides is silent housekeeping.
fn orphans(
    paths: &Paths,
    journal: &Journal,
    declared: &std::collections::HashSet<String>,
    findings: &mut Vec<Finding>,
    stale: &mut Vec<String>,
) {
    for identity in journal.acknowledged_identities() {
        if declared.contains(&identity) {
            continue;
        }
        if still_present(paths, &identity) {
            findings.push(Finding::Orphan { identity });
        } else {
            stale.push(identity);
        }
    }
}

/// Is the thing an acknowledgement describes still on the machine?
fn still_present(paths: &Paths, identity: &str) -> bool {
    let identity = crate::model::Identity::parse(identity);
    let key = identity.key.as_str();
    match &identity.kind {
        Kind::File | Kind::Link => expand(paths, key).symlink_metadata().is_ok(),
        Kind::Defaults => key.split_once(':').is_some_and(|(domain, key)| {
            plist::Value::from_file(crate::defaults::domain_path(paths, domain))
                .ok()
                .and_then(|root| root.as_dictionary().map(|dict| dict.contains_key(key)))
                .unwrap_or(false)
        }),
        Kind::BrewFormula | Kind::BrewCask => {
            crate::brew::installed(paths, &identity.kind, key).is_some()
        }
        Kind::Npm => crate::npm::installed(key),
        Kind::Mise => crate::mise::installed(paths, key).is_some(),
        Kind::Service => crate::services::agent_plist(paths, key).is_file(),
        Kind::BrewService => crate::services::brew_service_plist(paths, key).is_file(),
        _ => false,
    }
}

fn expand(paths: &Paths, target: &str) -> PathBuf {
    paths.expand_home(target)
}

fn lines_differing(old: &[u8], new: &[u8]) -> usize {
    let old_text = String::from_utf8_lossy(old);
    let new_text = String::from_utf8_lossy(new);
    let old_lines: Vec<&str> = old_text.lines().collect();
    let new_lines: Vec<&str> = new_text.lines().collect();
    let common = old_lines.len().min(new_lines.len());
    let mut differing = old_lines.len().abs_diff(new_lines.len());
    for index in 0..common {
        if old_lines[index] != new_lines[index] {
            differing += 1;
        }
    }
    differing
}

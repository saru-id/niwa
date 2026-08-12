//! The journal: what the last apply did, per machine, never committed.
//!
//! Acknowledgements live here — the third of the model's three states.
//! The file is schema versioned, and a journal from a newer niwa is
//! refused with the way out spelled, never guessed at.

use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::Error;
use crate::model::Value;

/// The current journal schema. Changes ship with their migration in
/// the same release.
pub const SCHEMA: u32 = 1;

const FILE: &str = "journal.json";

#[derive(Debug, Serialize, Deserialize)]
pub struct Journal {
    schema: u32,
    /// Acknowledgements by identity string.
    acknowledged: BTreeMap<String, Acknowledgement>,
    /// One entry per apply that changed something, oldest first.
    #[serde(default)]
    applies: Vec<ApplyEntry>,
    /// Proposals answered "never": the permanent no, per machine.
    /// The one thing in the system that is neither declared, actual,
    /// nor acknowledged — the model's single appendix.
    #[serde(default)]
    declined: BTreeSet<String>,
}

/// What one apply changed, in order, with everything undo needs.
#[derive(Debug, Serialize, Deserialize)]
pub struct ApplyEntry {
    pub id: u64,
    pub steps: Vec<Step>,
}

/// One reversible (or honestly irreversible) effect.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Step {
    pub identity: String,
    pub effect: Effect,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Effect {
    /// A file was written. `previous` is the digest of the archived
    /// bytes it replaced; `None` means the file did not exist.
    FileWritten { previous: Option<String> },
    /// A symlink was made. `previous` is the digest of an archived
    /// regular file it displaced.
    LinkMade { previous: Option<String> },
    /// A preference key was set. `previous` is the value it replaced;
    /// `None` means the key did not exist.
    DefaultsSet { previous: Option<Value> },
    /// A package was installed by this run; undo uninstalls it.
    PackageInstalled,
    /// An agent's plist was written and the agent loaded. `previous`
    /// is the digest of the archived plist it replaced.
    ServiceSet { previous: Option<String> },
    /// A Homebrew service was started by this run; undo stops it.
    BrewServiceStarted,
}

/// What one apply left behind for one identity: the spec it made true
/// and, for byte-backed resources, the digest of the bytes it wrote.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Acknowledgement {
    pub spec: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bytes: Option<String>,
}

impl Default for Journal {
    fn default() -> Self {
        Self {
            schema: SCHEMA,
            acknowledged: BTreeMap::new(),
            applies: Vec::new(),
            declined: BTreeSet::new(),
        }
    }
}

impl Journal {
    /// Load the journal from the state directory. No file is an empty
    /// journal; a newer schema is an error naming the fix.
    pub fn load(state: &Path) -> Result<Self, Error> {
        let path = state.join(FILE);
        let raw = match std::fs::read(&path) {
            Ok(raw) => raw,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(Self::default());
            }
            Err(error) => {
                return Err(Error::JournalUnreadable {
                    detail: error.to_string(),
                });
            }
        };
        let journal: Self =
            serde_json::from_slice(&raw).map_err(|error| Error::JournalUnreadable {
                detail: error.to_string(),
            })?;
        if journal.schema > SCHEMA {
            return Err(Error::JournalNewer {
                found: journal.schema,
                supported: SCHEMA,
            });
        }
        Ok(journal)
    }

    /// Write the journal atomically: temp file, then rename.
    pub fn save(&self, state: &Path) -> Result<(), Error> {
        std::fs::create_dir_all(state).map_err(|error| Error::JournalUnreadable {
            detail: error.to_string(),
        })?;
        let path = state.join(FILE);
        let temp = state.join(format!("{FILE}.tmp"));
        let raw = serde_json::to_vec_pretty(self).map_err(|error| Error::JournalUnreadable {
            detail: error.to_string(),
        })?;
        std::fs::write(&temp, raw)
            .and_then(|()| std::fs::rename(&temp, &path))
            .map_err(|error| Error::JournalUnreadable {
                detail: error.to_string(),
            })
    }

    pub fn acknowledged(&self, identity: &str) -> Option<&Acknowledgement> {
        self.acknowledged.get(identity)
    }

    pub fn acknowledge(&mut self, identity: String, acknowledgement: Acknowledgement) {
        self.acknowledged.insert(identity, acknowledgement);
    }

    pub fn drop_acknowledgement(&mut self, identity: &str) {
        self.acknowledged.remove(identity);
    }

    /// Open the next apply entry and return its id. The entry is
    /// saved with every step, so an interruption keeps what landed.
    pub fn begin_apply(&mut self) -> u64 {
        let id = self.applies.last().map_or(1, |entry| entry.id + 1);
        self.applies.push(ApplyEntry {
            id,
            steps: Vec::new(),
        });
        id
    }

    pub fn record_step(&mut self, id: u64, step: Step) {
        if let Some(entry) = self.applies.iter_mut().find(|entry| entry.id == id) {
            entry.steps.push(step);
        }
    }

    /// Drop an apply entry that changed nothing; an empty entry would
    /// make `undo` report an apply that never was.
    pub fn discard_empty_apply(&mut self, id: u64) {
        if self
            .applies
            .last()
            .is_some_and(|last| last.id == id && last.steps.is_empty())
        {
            self.applies.pop();
        }
    }

    pub fn last_apply(&self) -> Option<&ApplyEntry> {
        self.applies.last()
    }

    /// Has this exact proposal been refused for good?
    pub fn is_declined(&self, proposal: &str) -> bool {
        self.declined.contains(proposal)
    }

    /// Remember a "never" so nobody is asked twice.
    pub fn decline(&mut self, proposal: String) {
        self.declined.insert(proposal);
    }

    /// Every acknowledged identity, for the drift survey.
    pub fn acknowledged_identities(&self) -> Vec<String> {
        self.acknowledged.keys().cloned().collect()
    }

    pub fn pop_apply(&mut self) -> Option<ApplyEntry> {
        self.applies.pop()
    }
}

/// The digest format acknowledgements use for bytes: sha256, hex.
pub fn digest(bytes: &[u8]) -> String {
    use sha2::Digest as _;
    use std::fmt::Write as _;
    let hash = sha2::Sha256::digest(bytes);
    let mut out = String::with_capacity(64);
    for byte in hash {
        let _ = write!(out, "{byte:02x}");
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_missing_journal_is_an_empty_journal() {
        let dir = tempfile::tempdir().unwrap();
        let journal = Journal::load(dir.path()).unwrap();
        assert!(journal.acknowledged("file:~/.zshrc").is_none());
    }

    #[test]
    fn acknowledgements_survive_a_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let mut journal = Journal::default();
        journal.acknowledge(
            "file:~/.zshrc".to_string(),
            Acknowledgement {
                spec: Value::Str("x".to_string()),
                bytes: Some(digest(b"hello")),
            },
        );
        journal.save(dir.path()).unwrap();
        let loaded = Journal::load(dir.path()).unwrap();
        let ack = loaded.acknowledged("file:~/.zshrc").unwrap();
        assert_eq!(ack.bytes.as_deref(), Some(digest(b"hello").as_str()));
    }

    #[test]
    fn a_journal_from_a_newer_niwa_is_refused_with_the_way_out() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("journal.json"),
            "{\"schema\": 99, \"acknowledged\": {}}",
        )
        .unwrap();
        let error = Journal::load(dir.path()).unwrap_err();
        let rendered = format!("{error}\n{}", error.detail().join("\n"));
        assert!(rendered.contains("newer"), "{rendered}");
        assert!(rendered.contains("update niwa"), "{rendered}");
    }

    #[test]
    fn digests_are_stable_sha256_hex() {
        assert_eq!(
            digest(b""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }
}

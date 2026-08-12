//! The lockfile: anything version-resolved records what it resolved
//! to, and the file is committed. Machine two gets your versions, not
//! whatever "latest" means the day it runs.
//!
//! The lock covers what pins well — releases fetched by tag,
//! toolchains through mise, shared modules by hash — and nothing
//! else. Homebrew is deliberately absent: pinning brew means fighting
//! its entire model, and the boundary is stated instead of
//! discovered.

use std::collections::BTreeMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::error::Error;
use crate::paths::Paths;

pub const FILE: &str = "niwa.lock";

#[derive(Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct Lockfile {
    /// The niwa version that last wrote this file.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub niwa: Option<String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub github_release: BTreeMap<String, ReleasePin>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub mise: BTreeMap<String, MisePin>,
    #[serde(default, rename = "use", skip_serializing_if = "BTreeMap::is_empty")]
    pub uses: BTreeMap<String, UsePin>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ReleasePin {
    pub version: String,
    pub sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MisePin {
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct UsePin {
    #[serde(rename = "ref")]
    pub reference: String,
    pub commit: String,
    pub sha256: String,
}

impl Lockfile {
    fn path(paths: &Paths) -> PathBuf {
        paths.config.join(FILE)
    }

    /// Read the committed lock; absent is empty.
    pub fn load(paths: &Paths) -> Result<Self, Error> {
        match std::fs::read_to_string(Self::path(paths)) {
            Ok(text) => toml::from_str(&text).map_err(|error| Error::Apply {
                doing: "reading niwa.lock".to_string(),
                detail: error.to_string(),
            }),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Self::default()),
            Err(error) => Err(Error::Apply {
                doing: "reading niwa.lock".to_string(),
                detail: error.to_string(),
            }),
        }
    }

    /// Write the lock with the header comment the example carries.
    pub fn save(&self, paths: &Paths) -> Result<(), Error> {
        let stamped = Self {
            niwa: Some(env!("CARGO_PKG_VERSION").to_string()),
            github_release: self.github_release.clone(),
            mise: self.mise.clone(),
            uses: self.uses.clone(),
        };
        let body = toml::to_string_pretty(&stamped).map_err(|error| Error::Apply {
            doing: "rendering niwa.lock".to_string(),
            detail: error.to_string(),
        })?;
        let text = format!(
            "# Written by niwa, committed on purpose: machine two resolves to the\n# same versions this machine did. Edit by running `niwa update <name>`.\n{body}"
        );
        std::fs::write(Self::path(paths), text).map_err(|error| Error::Apply {
            doing: "writing niwa.lock".to_string(),
            detail: error.to_string(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_example_lock_shape_round_trips() {
        let text = r#"
niwa = "1.0.0"

[github_release."jesseduffield/lazygit"]
version = "0.44.1"
sha256 = "9f2c"

[mise.node]
version = "22.11.0"

[use."github:stefan/niwa-rust"]
ref = "v1"
commit = "e5b19d7"
sha256 = "41ac"
"#;
        let lock: Lockfile = toml::from_str(text).unwrap();
        assert_eq!(
            lock.github_release["jesseduffield/lazygit"].version,
            "0.44.1"
        );
        assert_eq!(lock.mise["node"].version, "22.11.0");
        assert_eq!(lock.uses["github:stefan/niwa-rust"].commit, "e5b19d7");
        let rendered = toml::to_string_pretty(&lock).unwrap();
        assert!(rendered.contains("[github_release.\"jesseduffield/lazygit\"]"));
        assert!(rendered.contains("[use.\"github:stefan/niwa-rust\"]"));
    }
}

//! The per-machine stamp: one small committed file per machine, and
//! the answer to the only fleet question that matters — which
//! machines are behind.
//!
//! The journal stays local; the stamp is what crosses the repo. It is
//! keyed on a stable machine id, so renaming a Mac cannot silently
//! orphan its host file: the id stays, the display name moves, and
//! niwa says so instead of guessing.

use std::path::PathBuf;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::error::Error;
use crate::paths::Paths;
use crate::util::proc::bounded_stdout;

#[derive(Debug, Serialize, Deserialize)]
pub struct Stamp {
    pub machine_id: String,
    pub name: String,
    pub applied: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub config: Option<String>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub dirty: bool,
    pub niwa: String,
    pub resources: usize,
    /// Machine tags, when any are set.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
}

/// The stable identity this machine stamps with: the hardware UUID
/// where the platform will say, a persistent id in the state
/// directory where it will not (sandboxes, mostly).
pub fn machine_id(paths: &Paths) -> String {
    if let Some(output) = bounded_stdout(
        "ioreg",
        &["-rd1", "-c", "IOPlatformExpertDevice"],
        Duration::from_secs(5),
    ) {
        for line in output.lines() {
            if line.contains("IOPlatformUUID")
                && let Some(uuid) = line.split('"').nth(3)
            {
                return uuid.to_string();
            }
        }
    }
    let fallback = paths.state.join("machine-id");
    if let Ok(id) = std::fs::read_to_string(&fallback) {
        return id.trim().to_string();
    }
    // Exactly sixteen bytes: /dev/urandom never ends, so a whole-file
    // read would never return.
    let random: [u8; 16] = {
        use std::io::Read as _;
        let mut buffer = [0u8; 16];
        if let Ok(mut device) = std::fs::File::open("/dev/urandom") {
            let _ = device.read_exact(&mut buffer);
        }
        buffer
    };
    let id = crate::journal::digest(&random)[..32].to_uppercase();
    let _ = std::fs::create_dir_all(&paths.state);
    let _ = std::fs::write(&fallback, &id);
    id
}

/// The config repo's commit and dirtiness, when it is a repository.
pub fn config_commit(paths: &Paths) -> (Option<String>, bool) {
    if !paths.config.join(".git").exists() {
        return (None, false);
    }
    let repo = paths.config.display().to_string();
    let commit = bounded_stdout(
        "git",
        &["-C", &repo, "rev-parse", "--short", "HEAD"],
        Duration::from_secs(10),
    );
    let dirty = bounded_stdout(
        "git",
        &[
            "-C",
            &repo,
            "status",
            "--porcelain",
            "--",
            ".",
            ":(exclude)state",
        ],
        Duration::from_secs(10),
    )
    .is_some_and(|status| !status.is_empty());
    (commit, dirty)
}

/// Write this machine's stamp into the repo after an apply.
pub fn write(paths: &Paths, name: &str, resources: usize) -> Result<PathBuf, Error> {
    let (config, dirty) = config_commit(paths);
    let stamp = Stamp {
        machine_id: machine_id(paths),
        name: name.to_string(),
        applied: jiff::Timestamp::now()
            .round(jiff::Unit::Second)
            .map_or_else(
                |_| jiff::Timestamp::now().to_string(),
                |timestamp| timestamp.to_string(),
            ),
        config,
        dirty,
        niwa: env!("CARGO_PKG_VERSION").to_string(),
        resources,
        tags: crate::facts::read_tags(paths),
    };
    let dir = paths.config.join("state");
    std::fs::create_dir_all(&dir).map_err(|error| Error::Apply {
        doing: "creating state/".to_string(),
        detail: error.to_string(),
    })?;
    let file = dir.join(format!("{name}.toml"));
    let text = toml::to_string_pretty(&stamp).map_err(|error| Error::Apply {
        doing: "rendering the stamp".to_string(),
        detail: error.to_string(),
    })?;
    std::fs::write(&file, text).map_err(|error| Error::Apply {
        doing: "writing the stamp".to_string(),
        detail: error.to_string(),
    })?;
    Ok(file)
}

/// Every stamp in the repo, by file stem.
pub fn read_all(paths: &Paths) -> Vec<(String, Stamp)> {
    let mut stamps = Vec::new();
    let Ok(entries) = std::fs::read_dir(paths.config.join("state")) else {
        return stamps;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().is_none_or(|extension| extension != "toml") {
            continue;
        }
        let Some(stem) = path
            .file_stem()
            .map(|stem| stem.to_string_lossy().into_owned())
        else {
            continue;
        };
        if let Ok(text) = std::fs::read_to_string(&path)
            && let Ok(stamp) = toml::from_str::<Stamp>(&text)
        {
            stamps.push((stem, stamp));
        }
    }
    stamps.sort_by(|a, b| a.0.cmp(&b.0));
    stamps
}

/// How many commits a stamp trails the config's head by.
pub fn behind(paths: &Paths, commit: &str) -> Option<u64> {
    let repo = paths.config.display().to_string();
    bounded_stdout(
        "git",
        &[
            "-C",
            &repo,
            "rev-list",
            "--count",
            &format!("{commit}..HEAD"),
        ],
        Duration::from_secs(10),
    )
    .and_then(|count| count.trim().parse().ok())
}

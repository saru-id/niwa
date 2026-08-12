//! Where niwa reads and writes.
//!
//! Nothing outside this module reads `HOME` or the XDG variables. That
//! one rule is what lets every test and drill run hermetically: point
//! `HOME` at a temporary directory and the whole tool follows.

use std::path::{Path, PathBuf};

use crate::error::Error;

#[derive(Clone)]
pub struct Paths {
    /// The user's home directory, for `~/` expansion.
    pub home: PathBuf,
    /// The config repo: `~/.config/niwa`.
    pub config: PathBuf,
    /// Per-machine state that is never committed: the journal, and
    /// later the undo archives. `~/.local/state/niwa`.
    pub state: PathBuf,
    /// Where Homebrew lives: `HOMEBREW_PREFIX` when set and absolute,
    /// the architecture's default otherwise.
    pub brew_prefix: PathBuf,
    /// Shared data: `~/.local/share`. mise keeps its installs here,
    /// and niwa its shipped types.
    pub data: PathBuf,
}

impl Paths {
    pub fn resolve() -> Result<Self, Error> {
        let home = std::env::var_os("HOME")
            .map(PathBuf::from)
            .filter(|p| p.is_absolute())
            .ok_or(Error::NoHome)?;
        let config = xdg_dir(&home, "XDG_CONFIG_HOME", ".config").join("niwa");
        let state = xdg_dir(&home, "XDG_STATE_HOME", ".local/state").join("niwa");
        let brew_prefix = std::env::var_os("HOMEBREW_PREFIX")
            .map(PathBuf::from)
            .filter(|p| p.is_absolute())
            .unwrap_or_else(|| {
                if cfg!(target_arch = "aarch64") {
                    PathBuf::from("/opt/homebrew")
                } else {
                    PathBuf::from("/usr/local")
                }
            });
        let data = xdg_dir(&home, "XDG_DATA_HOME", ".local/share");
        Ok(Self {
            home,
            config,
            state,
            brew_prefix,
            data,
        })
    }

    /// Expand a target the way every resource means it: `~/` under
    /// this run's home, anything else as written. One expander, so a
    /// drill's redirected home covers every path uniformly.
    pub fn expand_home(&self, target: &str) -> PathBuf {
        target
            .strip_prefix("~/")
            .map_or_else(|| PathBuf::from(target), |rest| self.home.join(rest))
    }

    /// Where configuration profiles park the keys they own. The
    /// override exists for the hermetic tests; the default is the
    /// system's own place.
    pub fn managed_prefs() -> PathBuf {
        std::env::var_os("NIWA_MANAGED_PREFS")
            .map(PathBuf::from)
            .filter(|p| p.is_absolute())
            .unwrap_or_else(|| PathBuf::from("/Library/Managed Preferences"))
    }

    /// The sandbox rehearsal's world: the real config, and everything
    /// else under a scratch root that never existed before this run.
    pub fn sandboxed(&self, scratch: &Path) -> Self {
        Self {
            home: scratch.join("home"),
            config: self.config.clone(),
            state: scratch.join("state"),
            brew_prefix: scratch.join("brew"),
            data: scratch.join("share"),
        }
    }
}

/// An XDG variable is honored when set to an absolute path; anything
/// else falls back to the spec's default under `home`.
fn xdg_dir(home: &Path, var: &str, default: &str) -> PathBuf {
    std::env::var_os(var)
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
        .unwrap_or_else(|| home.join(default))
}

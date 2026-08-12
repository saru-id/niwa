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
        Ok(Self {
            home,
            config,
            state,
            brew_prefix,
        })
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

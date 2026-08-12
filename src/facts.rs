//! Machine facts: read once per run, so twenty guards asking the same
//! question cost one answer and the whole run sees a consistent world.

use std::time::Duration;

use crate::paths::Paths;
use crate::util::proc::bounded_stdout;

/// How long a fact-gathering child may take. Facts are optional
/// context, so a slow answer becomes no answer.
const FACT_TIMEOUT: Duration = Duration::from_secs(2);

pub struct Facts {
    /// The machine's short name, as `hosts/<name>.luau` expects it.
    pub name: String,
    /// The account's full name; empty when the system will not say.
    pub owner: String,
    /// `arm64` or `x86_64`.
    pub arch: String,
    /// The macOS version; empty when the system will not say.
    pub os: String,
    /// Machine tags; the `tag` verb will write them, later slices read
    /// them from the journal.
    pub tags: Vec<String>,
    /// Where Homebrew lives. `HOMEBREW_PREFIX` wins when set, the
    /// architecture default otherwise.
    pub brew_prefix: String,
}

impl Facts {
    pub fn gather(paths: &Paths) -> Self {
        let name = bounded_stdout("scutil", &["--get", "LocalHostName"], FACT_TIMEOUT)
            .or_else(|| bounded_stdout("uname", &["-n"], FACT_TIMEOUT))
            .map(|raw| raw.trim_end_matches(".local").to_string())
            .unwrap_or_default();
        let owner = bounded_stdout("id", &["-F"], FACT_TIMEOUT).unwrap_or_default();
        let os = bounded_stdout("sw_vers", &["-productVersion"], FACT_TIMEOUT).unwrap_or_default();
        Self {
            name,
            owner,
            arch: arch().to_string(),
            os,
            tags: Vec::new(),
            brew_prefix: paths.brew_prefix.display().to_string(),
        }
    }
}

const fn arch() -> &'static str {
    if cfg!(target_arch = "aarch64") {
        "arm64"
    } else {
        "x86_64"
    }
}

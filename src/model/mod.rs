//! The model. A resource's identity is its kind plus its natural key,
//! and everything hashes on it: acknowledgements, orphan detection,
//! conflict lints, undo entries, declined proposals. The typed sugar
//! lowers to the same identities as the generic forms, so conflict
//! detection sees straight through the syntax.

pub mod action;
pub mod analysis;
pub mod value;

use std::fmt;

pub use value::Value;

/// Every resource kind niwa knows. Custom kinds carry the name the
/// config registered them under.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Kind {
    BrewFormula,
    BrewCask,
    BrewService,
    Mas,
    Npm,
    Mise,
    GithubRelease,
    Defaults,
    File,
    Link,
    Hosts,
    LoginShell,
    Hostname,
    Service,
    Run,
    Once,
    Permission,
    Manual,
    Use,
    Custom(String),
}

impl Kind {
    pub fn as_str(&self) -> &str {
        match self {
            Self::BrewFormula => "brew.formula",
            Self::BrewCask => "brew.cask",
            Self::BrewService => "brew.service",
            Self::Mas => "mas",
            Self::Npm => "npm",
            Self::Mise => "mise",
            Self::GithubRelease => "github_release",
            Self::Defaults => "defaults",
            Self::File => "file",
            Self::Link => "link",
            Self::Hosts => "hosts",
            Self::LoginShell => "login_shell",
            Self::Hostname => "hostname",
            Self::Service => "service",
            Self::Run => "run",
            Self::Once => "once",
            Self::Permission => "permission",
            Self::Manual => "manual",
            Self::Use => "use",
            Self::Custom(name) => name,
        }
    }

    /// Names a custom kind may not take.
    pub const RESERVED: [&'static str; 19] = [
        "brew.formula",
        "brew.cask",
        "brew.service",
        "mas",
        "npm",
        "mise",
        "github_release",
        "defaults",
        "file",
        "link",
        "hosts",
        "login_shell",
        "hostname",
        "service",
        "run",
        "once",
        "permission",
        "manual",
        "use",
    ];
}

impl fmt::Display for Kind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Kind plus natural key: `brew.formula:jq`,
/// `defaults:com.apple.dock:autohide`, `file:~/.zshrc`. Singleton
/// kinds use an empty key and display as the kind alone.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Identity {
    pub kind: Kind,
    pub key: String,
}

impl Identity {
    pub fn new(kind: Kind, key: impl Into<String>) -> Self {
        Self {
            kind,
            key: key.into(),
        }
    }
}

impl fmt::Display for Identity {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        if self.key.is_empty() {
            write!(f, "{}", self.kind)
        } else {
            write!(f, "{}:{}", self.kind, self.key)
        }
    }
}

/// Where a declaration was made: the config-relative file and line,
/// captured from the VM at declaration time.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Provenance {
    pub file: String,
    pub line: u32,
}

impl fmt::Display for Provenance {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}:{}", self.file, self.line)
    }
}

/// Which layer of the config declared a resource. Hosts may override
/// modules; two modules disagreeing is a lint error.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Unit {
    Init,
    Module(String),
    Host(String),
}

impl Unit {
    /// Derive the unit from a config-relative chunk name like
    /// `modules/desktop.luau` or `hosts/airborne.luau`.
    pub fn from_chunk(name: &str) -> Self {
        let stem = |path: &str| {
            std::path::Path::new(path)
                .file_stem()
                .map_or_else(|| path.to_string(), |s| s.to_string_lossy().into_owned())
        };
        name.strip_prefix("hosts/")
            .map(|rest| Self::Host(stem(rest)))
            .or_else(|| {
                name.strip_prefix("modules/")
                    .map(|rest| Self::Module(stem(rest)))
            })
            .unwrap_or(Self::Init)
    }

    /// Does this unit answer to the given name? `init` names the
    /// entry file; modules and hosts answer to their file stem.
    pub fn is_named(&self, name: &str) -> bool {
        match self {
            Self::Init => name == "init",
            Self::Module(stem) | Self::Host(stem) => stem == name,
        }
    }

    pub const fn is_host(&self) -> bool {
        matches!(self, Self::Host(_))
    }
}

/// One resource declaration: what the config asked for, in canonical
/// form, and where it said so.
#[derive(Clone, Debug)]
pub struct Declaration {
    pub identity: Identity,
    pub spec: Value,
    pub provenance: Provenance,
    pub unit: Unit,
    /// Needs administrator rights; the plan folds these into one
    /// password prompt at the top.
    #[allow(
        dead_code,
        reason = "set by every declaration today; the plan reads it when it lands"
    )]
    pub privileged: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identities_render_as_kind_and_key() {
        let id = Identity::new(Kind::BrewFormula, "jq");
        assert_eq!(id.to_string(), "brew.formula:jq");
        let id = Identity::new(Kind::Defaults, "com.apple.dock:autohide");
        assert_eq!(id.to_string(), "defaults:com.apple.dock:autohide");
    }

    #[test]
    fn a_singleton_identity_displays_as_its_kind_alone() {
        let id = Identity::new(Kind::Custom("hostname".to_string()), "");
        assert_eq!(id.to_string(), "hostname");
    }

    #[test]
    fn units_derive_from_chunk_names() {
        assert_eq!(Unit::from_chunk("init.luau"), Unit::Init);
        assert_eq!(
            Unit::from_chunk("modules/desktop.luau"),
            Unit::Module("desktop".to_string())
        );
        assert_eq!(
            Unit::from_chunk("hosts/airborne.luau"),
            Unit::Host("airborne".to_string())
        );
        assert!(Unit::from_chunk("hosts/airborne.luau").is_host());
    }
}

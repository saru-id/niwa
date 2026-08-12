//! Library-shaped errors. Rendering for humans happens in `out`; the
//! `Display` string is the "what happened" line, and `detail` carries
//! the lines that answer "what to do next".

use std::path::PathBuf;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("HOME is not set")]
    NoHome,

    #[error("no config found")]
    ConfigMissing { dir: PathBuf },

    #[error("the config failed to load")]
    Script { message: String },

    #[error("declarations conflict")]
    Conflicts(Vec<crate::model::analysis::Conflict>),

    #[error("the config points at files that do not exist")]
    MissingSources(Vec<(String, crate::model::Provenance)>),

    #[error(
        "the journal was written by a newer niwa (schema {found}, this niwa reads up to {supported})"
    )]
    JournalNewer { found: u32, supported: u32 },

    #[error("the journal cannot be read")]
    JournalUnreadable { detail: String },
}

impl From<mlua::Error> for Error {
    /// The VM's message already carries `file:line`, because chunks
    /// are named after their config-relative paths.
    fn from(error: mlua::Error) -> Self {
        Self::Script {
            message: error.to_string(),
        }
    }
}

impl Error {
    /// Follow-up lines for `out::Out::error`: what to do next, and any
    /// context worth a second line. An empty answer means the display
    /// line already says everything.
    pub fn detail(&self) -> Vec<String> {
        match self {
            Self::NoHome => vec!["set HOME and run niwa again".to_string()],
            Self::ConfigMissing { dir } => vec![
                format!("looked in {}", dir.display()),
                format!(
                    "create {}/init.luau, or clone your config repo there",
                    dir.display()
                ),
            ],
            Self::Script { message } => message.lines().map(str::to_string).collect(),
            Self::Conflicts(conflicts) => {
                let mut lines = Vec::new();
                for conflict in conflicts {
                    lines.push(format!(
                        "{} is declared twice with different values:",
                        conflict.identity
                    ));
                    for location in &conflict.locations {
                        lines.push(format!("  {location}"));
                    }
                }
                lines.push("keep one, or move the override into a host file".to_string());
                lines
            }
            Self::MissingSources(missing) => missing
                .iter()
                .map(|(source, provenance)| format!("{provenance}: `{source}` does not exist"))
                .collect(),
            Self::JournalNewer { .. } => {
                vec!["update niwa, then run this again".to_string()]
            }
            Self::JournalUnreadable { detail } => {
                vec![detail.clone(), "run `niwa doctor` once it exists; the journal file lives under ~/.local/state/niwa".to_string()]
            }
        }
    }
}

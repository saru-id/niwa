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

    #[error("another apply is already running")]
    ApplyLocked { path: PathBuf },

    #[error("{doing} failed")]
    Apply { doing: String, detail: String },

    #[error("the config tree has uncommitted changes")]
    DirtyTree,

    #[error("apply needs a confirmation and no terminal is attached")]
    NeedsConfirmation,

    #[error("pull walks differences one at a time and needs a terminal")]
    NeedsWalk,

    #[error("the config holds lines that read like credentials")]
    Gate(Vec<(String, usize, String)>),

    #[error("{identity} failed · {provenance}")]
    ResourceFailed {
        identity: String,
        provenance: String,
        command: String,
        code: Option<i32>,
        stderr: String,
    },
}

impl From<mlua::Error> for Error {
    /// A niwa error thrown inside a VM callback comes back out with
    /// its structure; anything else is a script failure whose message
    /// already carries `file:line`, because chunks are named after
    /// their config-relative paths.
    fn from(error: mlua::Error) -> Self {
        if let Some(recovered) = recover(&error) {
            return recovered;
        }
        Self::Script {
            message: error.to_string(),
        }
    }
}

/// Walk an mlua error for a niwa error smuggled through the VM as an
/// external error, and rebuild it. Only the variants a verb renders
/// specially need recovering.
fn recover(error: &mlua::Error) -> Option<Error> {
    match error {
        mlua::Error::ExternalError(source) => {
            let error = source.downcast_ref::<Error>()?;
            match error {
                Error::ResourceFailed {
                    identity,
                    provenance,
                    command,
                    code,
                    stderr,
                } => Some(Error::ResourceFailed {
                    identity: identity.clone(),
                    provenance: provenance.clone(),
                    command: command.clone(),
                    code: *code,
                    stderr: stderr.clone(),
                }),
                _ => None,
            }
        }
        mlua::Error::CallbackError { cause, .. } | mlua::Error::WithContext { cause, .. } => {
            recover(cause)
        }
        _ => None,
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
            Self::ApplyLocked { path } => vec![
                format!("the lock is {}", path.display()),
                "wait for the other apply to finish; if it crashed, delete the lock file"
                    .to_string(),
            ],
            Self::Apply { detail, .. } => vec![detail.clone()],
            Self::DirtyTree => vec![
                "unattended applies run committed configs only: commit first".to_string(),
                "pass --dirty with --yes if you truly mean to apply uncommitted edits".to_string(),
            ],
            Self::NeedsConfirmation => {
                vec!["pass --yes to apply without a prompt".to_string()]
            }
            Self::NeedsWalk => {
                vec!["pass --all to stage everything and review with `git diff`".to_string()]
            }
            Self::Gate(hits) => {
                let mut lines: Vec<String> = hits
                    .iter()
                    .map(|(file, line, reason)| format!("{file}:{line} looks like {reason}"))
                    .collect();
                lines.push(
                    "move real secrets into the keychain or secrets/<name>.age; niwa never commits sealed files in the clear"
                        .to_string(),
                );
                lines
            }
            Self::ResourceFailed {
                command,
                code,
                stderr,
                ..
            } => {
                let mut lines = vec![code.map_or_else(
                    || format!("{command} (no exit: killed at the deadline, or not found)"),
                    |code| format!("{command} (exit {code})"),
                )];
                lines.extend(stderr.lines().map(str::to_string));
                lines
            }
            Self::JournalUnreadable { detail } => {
                vec![detail.clone(), "run `niwa doctor` once it exists; the journal file lives under ~/.local/state/niwa".to_string()]
            }
        }
    }
}

//! The execution engine: make the plan true, in program order, and
//! leave a journal a person can trust.
//!
//! Three rules govern every write. Nothing is ever the only copy: any
//! overwrite archives the previous bytes first. The overwrite rule
//! protects hand edits: bytes the journal acknowledges are niwa's to
//! replace, bytes it does not are a person's, and apply stops instead
//! of guessing. The journal is written per resource as effects land,
//! so an interruption leaves a coherent partial state and the resume
//! is a plain re-run.

use std::path::{Path, PathBuf};

use crate::error::Error;
use crate::journal::{Acknowledgement, ApplyEntry, Effect, Journal, Step, digest};
use crate::model::{Declaration, Kind, Value};
use crate::paths::Paths;
use crate::plan::Action;

/// What one resource's execution came to.
pub enum Outcome {
    /// The machine already agreed.
    InSync,
    /// The resource was made true.
    Done,
    /// The target holds bytes niwa never wrote; apply does not guess.
    Protected,
    /// No provider can act on this kind yet.
    Unchecked,
}

/// The exclusive lock: one apply at a time. Plan, check, and the
/// watcher are read-only and never take it. Dropping unlocks.
pub struct Lock {
    path: PathBuf,
}

impl Lock {
    pub fn take(state: &Path) -> Result<Self, Error> {
        std::fs::create_dir_all(state)
            .map_err(|error| apply_error("creating the state directory", &error))?;
        let path = state.join("apply.lock");
        match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
        {
            Ok(_) => Ok(Self { path }),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                Err(Error::ApplyLocked { path })
            }
            Err(error) => Err(apply_error("taking the apply lock", &error)),
        }
    }
}

impl Drop for Lock {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}

/// Settle one pending declaration against the machine: compare, then
/// act when there is work. The engine calls this in program order.
pub fn perform(
    declaration: &Declaration,
    paths: &Paths,
    journal: &mut Journal,
    force: bool,
) -> Result<(Outcome, Option<Effect>), Error> {
    let archive_root = archive_dir(paths);
    match crate::plan::compare(declaration, paths, journal) {
        Action::InSync => {
            // Already true is agreement, not an event; acknowledge
            // silently so drift detection has its baseline.
            acknowledge_current(declaration, paths, journal);
            Ok((Outcome::InSync, None))
        }
        Action::Unchecked => Ok((Outcome::Unchecked, None)),
        Action::Create | Action::Change { .. } => {
            apply_one(declaration, paths, journal, &archive_root, force)
        }
    }
}

/// Where this run's displaced bytes go. One directory per apply,
/// named by a monotonic counter persisted beside the journal.
fn archive_dir(paths: &Paths) -> PathBuf {
    paths.state.join("archive")
}

fn apply_one(
    declaration: &Declaration,
    paths: &Paths,
    journal: &mut Journal,
    archive_root: &Path,
    force: bool,
) -> Result<(Outcome, Option<Effect>), Error> {
    match &declaration.identity.kind {
        Kind::File => apply_file(declaration, paths, journal, archive_root, force),
        Kind::Link => apply_link(declaration, paths, journal, archive_root, force),
        Kind::Defaults => apply_defaults(declaration, paths, journal, archive_root),
        _ => Ok((Outcome::Unchecked, None)),
    }
}

const fn fields_of(
    declaration: &Declaration,
) -> Option<&std::collections::BTreeMap<String, Value>> {
    match &declaration.spec {
        Value::Map(fields) => Some(fields),
        _ => None,
    }
}

fn expand_target(paths: &Paths, target: &str) -> PathBuf {
    target
        .strip_prefix("~/")
        .map_or_else(|| PathBuf::from(target), |rest| paths.home.join(rest))
}

/// The overwrite rule, stated once. Existing bytes are free to
/// replace when they are exactly what the journal acknowledges niwa
/// last wrote; anything else is a hand edit and stays protected
/// unless forced. Either way, what is replaced is archived first.
fn may_overwrite(
    declaration: &Declaration,
    journal: &Journal,
    current: &[u8],
    force: bool,
) -> bool {
    if force {
        return true;
    }
    journal
        .acknowledged(&declaration.identity.to_string())
        .and_then(|ack| ack.bytes.as_deref())
        .is_some_and(|acknowledged| acknowledged == digest(current))
}

/// Move existing bytes into the archive before they are replaced.
fn archive(archive_root: &Path, identity: &str, bytes: &[u8]) -> Result<(), Error> {
    let dir = archive_root.join(sanitize(identity));
    std::fs::create_dir_all(&dir)
        .map_err(|error| apply_error("archiving the previous bytes", &error))?;
    // One archived copy per distinct content: the digest is the name,
    // so undo can find it and repeats cost nothing.
    let path = dir.join(digest(bytes));
    std::fs::write(&path, bytes)
        .map_err(|error| apply_error("archiving the previous bytes", &error))
}

fn sanitize(identity: &str) -> String {
    identity
        .chars()
        .map(|c| if c == '/' { '_' } else { c })
        .collect()
}

fn apply_file(
    declaration: &Declaration,
    paths: &Paths,
    journal: &mut Journal,
    archive_root: &Path,
    force: bool,
) -> Result<(Outcome, Option<Effect>), Error> {
    let Some(fields) = fields_of(declaration) else {
        return Ok((Outcome::Unchecked, None));
    };
    let target = expand_target(paths, &declaration.identity.key);

    let declared: Vec<u8> = match (fields.get("source"), fields.get("content")) {
        (Some(Value::Str(source)), _) => {
            let Some(rest) = source.strip_prefix("@self/") else {
                return Ok((Outcome::Unchecked, None));
            };
            std::fs::read(paths.config.join(rest))
                .map_err(|error| apply_error(&format!("reading {source}"), &error))?
        }
        (_, Some(Value::Str(content))) => content.clone().into_bytes(),
        // Rendered content needs secrets; that lands with the secrets
        // milestone. Until then rendered files stay unchecked at
        // execution.
        _ => return Ok((Outcome::Unchecked, None)),
    };

    // The overwrite rule, for targets that already hold other bytes.
    let previous = if let Ok(current) = std::fs::read(&target) {
        if current != declared && !may_overwrite(declaration, journal, &current, force) {
            return Ok((Outcome::Protected, None));
        }
        archive(archive_root, &declaration.identity.to_string(), &current)?;
        Some(digest(&current))
    } else {
        None
    };

    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| apply_error("creating the target directory", &error))?;
    }
    write_atomic(&target, &declared)?;
    if let Some(Value::Int(mode)) = fields.get("mode") {
        use std::os::unix::fs::PermissionsExt as _;
        #[allow(
            clippy::cast_possible_truncation,
            clippy::cast_sign_loss,
            reason = "validation bounds the mode to 0..=0o7777"
        )]
        let permissions = std::fs::Permissions::from_mode(*mode as u32);
        std::fs::set_permissions(&target, permissions)
            .map_err(|error| apply_error("setting the file mode", &error))?;
    }

    journal.acknowledge(
        declaration.identity.to_string(),
        Acknowledgement {
            spec: declaration.spec.clone(),
            bytes: Some(digest(&declared)),
        },
    );
    Ok((Outcome::Done, Some(Effect::FileWritten { previous })))
}

fn apply_link(
    declaration: &Declaration,
    paths: &Paths,
    journal: &mut Journal,
    archive_root: &Path,
    force: bool,
) -> Result<(Outcome, Option<Effect>), Error> {
    let Some(fields) = fields_of(declaration) else {
        return Ok((Outcome::Unchecked, None));
    };
    let Some(Value::Str(to)) = fields.get("to") else {
        return Ok((Outcome::Unchecked, None));
    };
    let Some(rest) = to.strip_prefix("@self/") else {
        return Ok((Outcome::Unchecked, None));
    };
    let destination = paths.config.join(rest);
    let target = expand_target(paths, &declaration.identity.key);

    // A plain file in the way follows the overwrite rule; a wrong
    // symlink is niwa's kind of object and is replaced freely.
    let mut previous = None;
    match std::fs::symlink_metadata(&target) {
        Ok(meta) if meta.file_type().is_symlink() => {
            std::fs::remove_file(&target)
                .map_err(|error| apply_error("replacing the old link", &error))?;
        }
        Ok(meta) if meta.is_file() => {
            let current = std::fs::read(&target).unwrap_or_default();
            if !may_overwrite(declaration, journal, &current, force) {
                return Ok((Outcome::Protected, None));
            }
            archive(archive_root, &declaration.identity.to_string(), &current)?;
            previous = Some(digest(&current));
            std::fs::remove_file(&target)
                .map_err(|error| apply_error("moving the old file aside", &error))?;
        }
        Ok(_) => return Ok((Outcome::Protected, None)),
        Err(_) => {}
    }

    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| apply_error("creating the target directory", &error))?;
    }
    std::os::unix::fs::symlink(&destination, &target)
        .map_err(|error| apply_error("creating the link", &error))?;

    journal.acknowledge(
        declaration.identity.to_string(),
        Acknowledgement {
            spec: declaration.spec.clone(),
            bytes: None,
        },
    );
    Ok((Outcome::Done, Some(Effect::LinkMade { previous })))
}

fn apply_defaults(
    declaration: &Declaration,
    paths: &Paths,
    journal: &mut Journal,
    archive_root: &Path,
) -> Result<(Outcome, Option<Effect>), Error> {
    let Some(fields) = fields_of(declaration) else {
        return Ok((Outcome::Unchecked, None));
    };
    let Some(declared) = fields.get("value") else {
        return Ok((Outcome::Unchecked, None));
    };
    let Some((domain, key)) = declaration.identity.key.split_once(':') else {
        return Ok((Outcome::Unchecked, None));
    };

    let store = crate::plan::domain_path(paths, domain);
    let mut root = plist::Value::from_file(&store)
        .ok()
        .and_then(plist::Value::into_dictionary)
        .unwrap_or_default();

    // Archive the whole previous plist: a defaults value is small,
    // and the file is the honest unit of "what was there before".
    if let Ok(previous) = std::fs::read(&store) {
        archive(archive_root, &declaration.identity.to_string(), &previous)?;
    }

    let previous = root.get(key).map(crate::plan::plist_to_value);
    root.insert(key.to_string(), value_to_plist(declared));
    if let Some(parent) = store.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| apply_error("creating the preferences directory", &error))?;
    }
    plist::Value::Dictionary(root)
        .to_file_binary(&store)
        .map_err(|error| apply_error("writing the preference file", &error))?;

    journal.acknowledge(
        declaration.identity.to_string(),
        Acknowledgement {
            spec: declaration.spec.clone(),
            bytes: None,
        },
    );
    Ok((Outcome::Done, Some(Effect::DefaultsSet { previous })))
}

/// Row two of the truth table: declared and already actual, not yet
/// acknowledged. Acknowledge silently so the baseline exists.
fn acknowledge_current(declaration: &Declaration, paths: &Paths, journal: &mut Journal) {
    let bytes = match &declaration.identity.kind {
        Kind::File => {
            let target = expand_target(paths, &declaration.identity.key);
            std::fs::read(target).ok().map(|bytes| digest(&bytes))
        }
        _ => None,
    };
    journal.acknowledge(
        declaration.identity.to_string(),
        Acknowledgement {
            spec: declaration.spec.clone(),
            bytes,
        },
    );
}

fn write_atomic(target: &Path, bytes: &[u8]) -> Result<(), Error> {
    let temp = target.with_extension("niwa-tmp");
    std::fs::write(&temp, bytes)
        .and_then(|()| std::fs::rename(&temp, target))
        .map_err(|error| apply_error(&format!("writing {}", target.display()), &error))
}

/// One shape for every failed step: what was being done, and what the
/// system said.
fn apply_error(doing: &str, detail: &dyn std::fmt::Display) -> Error {
    Error::Apply {
        doing: doing.to_string(),
        detail: detail.to_string(),
    }
}

/// Turn a canonical value back into a plist value for writing.
pub fn value_to_plist(value: &Value) -> plist::Value {
    match value {
        Value::Bool(b) => plist::Value::Boolean(*b),
        Value::Int(i) => plist::Value::Integer((*i).into()),
        Value::Float(f) => plist::Value::Real(*f),
        Value::Str(s) => plist::Value::String(s.clone()),
        Value::List(items) => plist::Value::Array(items.iter().map(value_to_plist).collect()),
        Value::Map(map) => plist::Value::Dictionary(
            map.iter()
                .map(|(key, value)| (key.clone(), value_to_plist(value)))
                .collect(),
        ),
    }
}

/// Reverse one apply entry, newest step first. Each restoration
/// archives what it displaces: undo is a write like any other, and
/// nothing is ever the only copy.
pub fn reverse(entry: &ApplyEntry, paths: &Paths, journal: &mut Journal) -> Result<usize, Error> {
    let archive_root = archive_dir(paths);
    let mut reversed = 0;
    for step in entry.steps.iter().rev() {
        reverse_step(step, paths, &archive_root)?;
        journal.drop_acknowledgement(&step.identity);
        journal.save(&paths.state)?;
        reversed += 1;
    }
    Ok(reversed)
}

fn reverse_step(step: &Step, paths: &Paths, archive_root: &Path) -> Result<(), Error> {
    match &step.effect {
        Effect::FileWritten { previous } => {
            let Some(target) = step.identity.strip_prefix("file:") else {
                return Ok(());
            };
            let target = expand_target(paths, target);
            if let Ok(current) = std::fs::read(&target) {
                archive(archive_root, &step.identity, &current)?;
            }
            match previous {
                Some(digest) => {
                    let bytes = read_archived(archive_root, &step.identity, digest)?;
                    write_atomic(&target, &bytes)?;
                }
                None => {
                    std::fs::remove_file(&target)
                        .map_err(|error| apply_error("removing the created file", &error))?;
                }
            }
        }
        Effect::LinkMade { previous } => {
            let Some(target) = step.identity.strip_prefix("link:") else {
                return Ok(());
            };
            let target = expand_target(paths, target);
            if std::fs::symlink_metadata(&target).is_ok() {
                std::fs::remove_file(&target)
                    .map_err(|error| apply_error("removing the link", &error))?;
            }
            if let Some(digest) = previous {
                let bytes = read_archived(archive_root, &step.identity, digest)?;
                write_atomic(&target, &bytes)?;
            }
        }
        Effect::PackageInstalled => {
            let (kind, name) = match step.identity.split_once(':') {
                Some(("brew.formula", name)) => (crate::model::Kind::BrewFormula, name),
                Some(("brew.cask", name)) => (crate::model::Kind::BrewCask, name),
                _ => return Ok(()),
            };
            crate::brew::uninstall(&kind, name, std::time::Duration::from_mins(10)).map_err(
                |detail| Error::Apply {
                    doing: format!("uninstalling {name}"),
                    detail,
                },
            )?;
        }
        Effect::DefaultsSet { previous } => {
            let Some(rest) = step.identity.strip_prefix("defaults:") else {
                return Ok(());
            };
            let Some((domain, key)) = rest.split_once(':') else {
                return Ok(());
            };
            let store = crate::plan::domain_path(paths, domain);
            if let Ok(bytes) = std::fs::read(&store) {
                archive(archive_root, &step.identity, &bytes)?;
            }
            let mut root = plist::Value::from_file(&store)
                .ok()
                .and_then(plist::Value::into_dictionary)
                .unwrap_or_default();
            match previous {
                Some(value) => {
                    root.insert(key.to_string(), value_to_plist(value));
                }
                None => {
                    root.remove(key);
                }
            }
            plist::Value::Dictionary(root)
                .to_file_binary(&store)
                .map_err(|error| apply_error("restoring the preference file", &error))?;
        }
    }
    Ok(())
}

fn read_archived(archive_root: &Path, identity: &str, digest: &str) -> Result<Vec<u8>, Error> {
    let path = archive_root.join(sanitize(identity)).join(digest);
    std::fs::read(&path)
        .map_err(|error| apply_error(&format!("reading the archived copy for {identity}"), &error))
}

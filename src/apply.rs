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
use crate::journal::{Acknowledgement, Effect, Journal, Step, digest};
use crate::model::action::Action;
use crate::model::{Declaration, Kind, Value};
use crate::paths::Paths;

/// What one resource's execution came to.
pub enum Outcome {
    /// The machine already agreed.
    InSync,
    /// The resource was made true.
    Done,
    /// The target holds bytes niwa never wrote; apply does not guess.
    Protected,
    /// An `optional` resource failed: reported in its result, never
    /// fatal — the design's whole reason for the flag.
    Failed,
    /// No provider can act on this kind yet.
    Unchecked,
}

/// The exclusive lock: one apply at a time. Plan, check, and the
/// watcher are read-only and never take it. Dropping unlocks.
pub struct Lock {
    path: PathBuf,
}

impl Lock {
    /// Take the lock, stamping this process id into it. A lock whose
    /// stamped holder is dead is reclaimed — a crash must never need
    /// a human with an `rm`. The bool reports a reclaim, so the verb
    /// can say it out loud.
    pub fn take(state: &Path) -> Result<(Self, bool), Error> {
        std::fs::create_dir_all(state)
            .map_err(|error| apply_error("creating the state directory", &error))?;
        let path = state.join("apply.lock");
        match Self::try_stamp(&path) {
            Ok(lock) => Ok((lock, false)),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                if Self::holder_is_dead(&path) {
                    let _ = std::fs::remove_file(&path);
                    let lock = Self::try_stamp(&path)
                        .map_err(|error| apply_error("taking the apply lock", &error))?;
                    return Ok((lock, true));
                }
                Err(Error::ApplyLocked { path })
            }
            Err(error) => Err(apply_error("taking the apply lock", &error)),
        }
    }

    fn try_stamp(path: &Path) -> std::io::Result<Self> {
        use std::io::Write as _;
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path)?;
        write!(file, "{}", std::process::id())?;
        Ok(Self {
            path: path.to_path_buf(),
        })
    }

    /// Only a lock that names a pid, and whose pid no longer runs,
    /// reads as dead. An empty or garbled lock is treated as held —
    /// it may be mid-write by a live process.
    fn holder_is_dead(path: &Path) -> bool {
        let Some(pid) = std::fs::read_to_string(path)
            .ok()
            .and_then(|text| text.trim().parse::<u32>().ok())
        else {
            return false;
        };
        let probe = crate::util::proc::bounded_output(
            "ps",
            &["-p", &pid.to_string()],
            std::time::Duration::from_secs(5),
        );
        // ps answers 0 for a live pid, 1 for a dead one. No answer at
        // all (ps unreachable) reads as held: never steal on a guess.
        matches!(probe, Some(finished) if finished.code == Some(1))
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
    lock: &crate::lockfile::Lockfile,
    force: bool,
) -> Result<(Outcome, Option<Effect>), Error> {
    let archive_root = archive_dir(paths);
    match crate::plan::compare(declaration, paths, journal, lock) {
        Action::InSync => {
            // Already true is agreement, not an event; acknowledge
            // silently so drift detection has its baseline.
            acknowledge_current(declaration, paths, journal);
            Ok((Outcome::InSync, None))
        }
        Action::Unchecked => Ok((Outcome::Unchecked, None)),
        Action::Create | Action::Change { .. } => match &declaration.identity.kind {
            Kind::GithubRelease => apply_release(declaration, paths, journal, lock),
            Kind::Run | Kind::Once => apply_exec(declaration, paths, journal),
            _ => apply_one(declaration, paths, journal, &archive_root, force),
        },
    }
}

/// Run a guarded command, or a once block's marker. Both are
/// irreversible, and the journal says exactly that.
fn apply_exec(
    declaration: &Declaration,
    paths: &Paths,
    journal: &mut Journal,
) -> Result<(Outcome, Option<Effect>), Error> {
    if matches!(declaration.identity.kind, Kind::Run)
        && let Err((code, stderr)) = crate::exec::run(declaration, paths)
    {
        if declaration.is_optional() {
            return Ok((Outcome::Failed, None));
        }
        return Err(Error::ResourceFailed {
            identity: declaration.identity.to_string(),
            provenance: declaration.provenance.to_string(),
            command: declaration.identity.key.clone(),
            code,
            stderr,
        });
    }
    // A once marker acknowledges without running anything itself; the
    // block's body already executed its own resources in order.
    journal.acknowledge(
        declaration.identity.to_string(),
        Acknowledgement::new(declaration.spec.clone(), None),
    );
    Ok((
        Outcome::Done,
        Some(Effect::Irreversible {
            what: declaration.identity.key.clone(),
        }),
    ))
}

/// Install a pinned release binary. Unpinned is an error naming the
/// fix, never a silent "latest".
fn apply_release(
    declaration: &Declaration,
    paths: &Paths,
    journal: &mut Journal,
    lock: &crate::lockfile::Lockfile,
) -> Result<(Outcome, Option<Effect>), Error> {
    let repo = &declaration.identity.key;
    let Some(pin) = lock.github_release.get(repo) else {
        return Err(Error::Apply {
            doing: format!("installing {repo}"),
            detail: format!("{repo} is not pinned in niwa.lock · run `niwa update`"),
        });
    };
    let bin = crate::release::bin_of(declaration);
    crate::release::install(paths, repo, &bin, pin)?;
    // The acknowledged digest is the pin's: compare reads it back to
    // tell a converged binary from a bumped pin's leftovers.
    journal.acknowledge(
        declaration.identity.to_string(),
        Acknowledgement::new(declaration.spec.clone(), Some(pin.sha256.clone())),
    );
    let path = crate::release::bin_dir(paths)
        .join(&bin)
        .display()
        .to_string();
    Ok((Outcome::Done, Some(Effect::BinaryInstalled { path })))
}

/// Where this run's displaced bytes go. One directory per apply,
/// named by a monotonic counter persisted beside the journal.
pub fn archive_dir(paths: &Paths) -> PathBuf {
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
        Kind::Service => apply_service(declaration, paths, journal, archive_root, force),
        Kind::BrewService => apply_brew_service(declaration, paths, journal),
        _ => Ok((Outcome::Unchecked, None)),
    }
}

/// Write the agent's plist (owned like a file, so the overwrite rule
/// and the archive apply), then load it — with a reload and kickstart
/// when the definition changed rather than appeared.
fn apply_service(
    declaration: &Declaration,
    paths: &Paths,
    journal: &mut Journal,
    archive_root: &Path,
    force: bool,
) -> Result<(Outcome, Option<Effect>), Error> {
    let Some(declared) = crate::services::render(paths, declaration) else {
        return Ok((Outcome::Unchecked, None));
    };
    let label = &declaration.identity.key;
    let target = crate::services::agent_plist(paths, label);

    let mut bytes = Vec::new();
    plist::Value::Dictionary(declared)
        .to_writer_xml(&mut bytes)
        .map_err(|error| apply_error("rendering the agent's plist", &error))?;

    let previous = if let Ok(current) = std::fs::read(&target) {
        if current != bytes && !may_overwrite(declaration, journal, &current, force) {
            return Ok((Outcome::Protected, None));
        }
        archive(archive_root, &declaration.identity.to_string(), &current)?;
        Some(digest(&current))
    } else {
        None
    };
    let reload = previous.is_some();

    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| apply_error("creating the agents directory", &error))?;
    }
    // The log directory has to exist before launchd tries to open it.
    if let Value::Map(fields) = &declaration.spec
        && let Some(Value::Str(logs)) = fields.get("logs")
    {
        let dir = paths.expand_home(logs);
        std::fs::create_dir_all(&dir)
            .map_err(|error| apply_error("creating the log directory", &error))?;
    }
    write_atomic(&target, &bytes)?;
    crate::services::bootstrap(paths, label, reload);

    journal.acknowledge(
        declaration.identity.to_string(),
        Acknowledgement::new(declaration.spec.clone(), Some(digest(&bytes))),
    );
    Ok((Outcome::Done, Some(Effect::ServiceSet { previous })))
}

/// Start a Homebrew service; the plist brew writes is the receipt the
/// check reads.
fn apply_brew_service(
    declaration: &Declaration,
    paths: &Paths,
    journal: &mut Journal,
) -> Result<(Outcome, Option<Effect>), Error> {
    let name = &declaration.identity.key;
    let invocation = crate::services::brew_service_start(name);
    if !crate::services::brew_service_plist(paths, name).is_file() {
        return Err(Error::ResourceFailed {
            identity: declaration.identity.to_string(),
            provenance: declaration.provenance.to_string(),
            command: invocation.command,
            code: invocation.code,
            stderr: invocation.stderr_tail,
        });
    }
    journal.acknowledge(
        declaration.identity.to_string(),
        Acknowledgement::new(declaration.spec.clone(), None),
    );
    Ok((Outcome::Done, Some(Effect::BrewServiceStarted)))
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
    paths.expand_home(target)
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
    crate::util::write_atomic(&path, bytes, None, false)
        .map_err(|error| apply_error("archiving the previous bytes", &error))
}

/// Substitute a rendered template's placeholders: plain values
/// inline, secret markers through the resolver. Returns the bytes and
/// whether any secret went in.
fn render_content(
    paths: &Paths,
    render: &std::collections::BTreeMap<String, Value>,
) -> Result<(Vec<u8>, bool), Error> {
    let Some(Value::Str(template)) = render.get("template") else {
        return Err(apply_error("rendering", &"the template is missing"));
    };
    let empty = std::collections::BTreeMap::new();
    let values = match render.get("values") {
        Some(Value::Map(values)) => values,
        _ => &empty,
    };
    let mut text = template.clone();
    let mut used_secrets = false;
    for (name, value) in values {
        let replacement = match value {
            Value::Map(marker) => {
                let Some(Value::Str(secret_name)) = marker.get("secret") else {
                    continue;
                };
                let from = match marker.get("from") {
                    Some(Value::Str(from)) => Some(from.as_str()),
                    _ => None,
                };
                used_secrets = true;
                crate::secrets::resolve(paths, secret_name, from).map_err(|looked| {
                    Error::SecretMissing {
                        name: secret_name.clone(),
                        looked,
                    }
                })?
            }
            other => crate::plan::render_value(other),
        };
        text = text.replace(&format!("{{{name}}}"), &replacement);
    }
    Ok((text.into_bytes(), used_secrets))
}

/// Archive with the content sealed; the file keeps its plaintext
/// digest for a name, so undo can find it without reading it.
fn archive_sealed(
    paths: &Paths,
    archive_root: &Path,
    identity: &str,
    bytes: &[u8],
) -> Result<(), Error> {
    let dir = archive_root.join(sanitize(identity));
    std::fs::create_dir_all(&dir)
        .map_err(|error| apply_error("archiving the previous bytes", &error))?;
    let sealed = crate::secrets::seal(paths, bytes)?;
    crate::util::write_atomic(&dir.join(digest(bytes)), &sealed, None, false)
        .map_err(|error| apply_error("archiving the previous bytes", &error))
}

/// Archive bytes for an identity, for callers outside the engine's
/// own effect paths (orphan removal archives what it takes away).
pub fn archive_bytes(archive_root: &Path, identity: &str, bytes: &[u8]) -> Result<(), Error> {
    archive(archive_root, identity, bytes)
}

/// Prune archives past the ninety-day horizon. Whatever the newest
/// apply references survives regardless of age: undo reaches it.
/// Best effort by design — a file that will not delete today deletes
/// on a later run.
pub fn prune_archives(paths: &Paths, journal: &Journal) {
    let keep: std::collections::HashSet<String> = journal
        .last_apply()
        .map(|entry| {
            entry
                .steps
                .iter()
                .filter_map(|step| match &step.effect {
                    Effect::FileWritten { previous }
                    | Effect::LinkMade { previous }
                    | Effect::ServiceSet { previous } => previous.clone(),
                    _ => None,
                })
                .collect()
        })
        .unwrap_or_default();
    let Some(cutoff) =
        std::time::SystemTime::now().checked_sub(std::time::Duration::from_hours(90 * 24))
    else {
        return;
    };
    let Ok(dirs) = std::fs::read_dir(archive_dir(paths)) else {
        return;
    };
    for dir in dirs.flatten() {
        let Ok(files) = std::fs::read_dir(dir.path()) else {
            continue;
        };
        for file in files.flatten() {
            let name = file.file_name().to_string_lossy().into_owned();
            let expired = file
                .metadata()
                .and_then(|meta| meta.modified())
                .is_ok_and(|modified| modified < cutoff);
            if expired && !keep.contains(&name) {
                let _ = std::fs::remove_file(file.path());
            }
        }
        // Only an emptied identity directory goes; remove_dir refuses
        // anything still holding archives.
        let _ = std::fs::remove_dir(dir.path());
    }
}

fn sanitize(identity: &str) -> String {
    // `_` escapes itself so `a/b` and `a_b` cannot share a home, and
    // anything past 120 bytes becomes a digest-suffixed stub: a
    // directory name must stay under the filesystem's 255-byte cap.
    let mapped: String = identity
        .chars()
        .flat_map(|c| match c {
            '/' => vec!['_', 's'],
            '_' => vec!['_', '_'],
            other => vec![other],
        })
        .collect();
    if mapped.len() <= 120 {
        mapped
    } else {
        let head: String = mapped.chars().take(64).collect();
        format!("{head}-{}", &digest(identity.as_bytes())[..16])
    }
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

    let mut sealed_archives = false;
    let declared: Vec<u8> = match (fields.get("source"), fields.get("content")) {
        (Some(Value::Str(source)), _) => {
            let Some(rest) = source.strip_prefix("@self/") else {
                return Ok((Outcome::Unchecked, None));
            };
            std::fs::read(paths.config.join(rest))
                .map_err(|error| apply_error(&format!("reading {source}"), &error))?
        }
        (_, Some(Value::Str(content))) => content.clone().into_bytes(),
        (_, Some(Value::Map(render))) => {
            // Secrets resolve here, at apply time, and nowhere
            // earlier. A file that held secrets gets sealed archives:
            // undo must never write plaintext into the state dir.
            let (bytes, used_secrets) = render_content(paths, render)?;
            sealed_archives = used_secrets;
            bytes
        }
        _ => return Ok((Outcome::Unchecked, None)),
    };

    // The overwrite rule, for targets that already hold other bytes.
    let previous = if let Ok(current) = std::fs::read(&target) {
        if current != declared && !may_overwrite(declaration, journal, &current, force) {
            return Ok((Outcome::Protected, None));
        }
        if sealed_archives {
            archive_sealed(
                paths,
                archive_root,
                &declaration.identity.to_string(),
                &current,
            )?;
        } else {
            archive(archive_root, &declaration.identity.to_string(), &current)?;
        }
        Some(digest(&current))
    } else {
        None
    };

    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| apply_error("creating the target directory", &error))?;
    }
    if let Some(Value::Int(mode)) = fields.get("mode") {
        #[allow(
            clippy::cast_possible_truncation,
            clippy::cast_sign_loss,
            reason = "validation bounds the mode to 0..=0o7777"
        )]
        write_atomic_mode(&target, &declared, *mode as u32)?;
    } else {
        write_atomic(&target, &declared)?;
    }

    journal.acknowledge(
        declaration.identity.to_string(),
        Acknowledgement::new(declaration.spec.clone(), Some(digest(&declared))),
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
        Acknowledgement::new(declaration.spec.clone(), None),
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

    let store = crate::defaults::domain_path(paths, domain);
    let mut root = plist::Value::from_file(&store)
        .ok()
        .and_then(plist::Value::into_dictionary)
        .unwrap_or_default();

    // Archive the whole previous plist: a defaults value is small,
    // and the file is the honest unit of "what was there before".
    if let Ok(previous) = std::fs::read(&store) {
        archive(archive_root, &declaration.identity.to_string(), &previous)?;
    }

    let previous = root.get(key).map(crate::defaults::plist_to_value);
    root.insert(key.to_string(), crate::defaults::value_to_plist(declared));
    if let Some(parent) = store.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| apply_error("creating the preferences directory", &error))?;
    }
    let mut rendered = Vec::new();
    plist::Value::Dictionary(root)
        .to_writer_binary(&mut rendered)
        .map_err(|error| apply_error("rendering the preference file", &error))?;
    write_atomic(&store, &rendered)?;

    journal.acknowledge(
        declaration.identity.to_string(),
        Acknowledgement::new(declaration.spec.clone(), None),
    );
    Ok((Outcome::Done, Some(Effect::DefaultsSet { previous })))
}

/// Row two of the truth table: declared and already actual, not yet
/// acknowledged. Acknowledge silently so the baseline exists.
fn acknowledge_current(declaration: &Declaration, paths: &Paths, journal: &mut Journal) {
    let bytes = match &declaration.identity.kind {
        Kind::File => {
            // Re-read once and re-prove the match: an edit landing
            // between compare's read and this one must stay the
            // person's bytes, never become niwa's to overwrite.
            let target = expand_target(paths, &declaration.identity.key);
            let live = std::fs::read(target).ok();
            match (&live, declared_file_bytes(paths, declaration)) {
                (Some(live), Some(declared)) if *live == declared => {}
                (_, None) => {}
                _ => return,
            }
            live.map(|bytes| digest(&bytes))
        }
        // A converged re-ack keeps what the install recorded — the
        // release digest compare reads back must survive row two.
        _ => journal
            .acknowledged(&declaration.identity.to_string())
            .and_then(|ack| ack.bytes.clone()),
    };
    journal.acknowledge(
        declaration.identity.to_string(),
        Acknowledgement::new(declaration.spec.clone(), bytes),
    );
}

/// The bytes a file declaration means, when they are knowable
/// without an apply: inline content, or an `@self/` source. Rendered
/// content resolves at apply time and answers `None`.
fn declared_file_bytes(paths: &Paths, declaration: &Declaration) -> Option<Vec<u8>> {
    let Value::Map(fields) = &declaration.spec else {
        return None;
    };
    match (fields.get("source"), fields.get("content")) {
        (Some(Value::Str(source)), _) => source
            .strip_prefix("@self/")
            .and_then(|rest| std::fs::read(paths.config.join(rest)).ok()),
        (_, Some(Value::Str(content))) => Some(content.clone().into_bytes()),
        _ => None,
    }
}

fn write_atomic(target: &Path, bytes: &[u8]) -> Result<(), Error> {
    crate::util::write_atomic(target, bytes, None, false)
        .map_err(|error| apply_error(&format!("writing {}", target.display()), &error))
}

/// A mode-carrying write: the permissions land on the temp before
/// the rename, so a `mode = "600"` file is never readable wider,
/// not even between two instructions.
fn write_atomic_mode(target: &Path, bytes: &[u8], mode: u32) -> Result<(), Error> {
    crate::util::write_atomic(target, bytes, Some(mode), false)
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

/// Reverse one apply entry, newest step first. Each restoration
/// archives what it displaces: undo is a write like any other, and
/// nothing is ever the only copy.
pub fn reverse_last(paths: &Paths, journal: &mut Journal) -> Result<usize, Error> {
    let archive_root = archive_dir(paths);
    let mut reversed = 0;
    let Some(target) = journal.last_apply().map(|entry| entry.id) else {
        return Ok(0);
    };
    // Newest effect first, and each reversed step leaves the journal
    // before the next begins: a failure or a kill keeps the
    // un-reversed remainder exactly where undo will find it. The
    // loop ends at this entry's boundary — undo reaches one apply.
    while let Some(step) = journal
        .last_apply()
        .filter(|entry| entry.id == target)
        .and_then(|entry| entry.steps.last().cloned())
    {
        reverse_step(&step, paths, &archive_root)?;
        journal.drop_acknowledgement(&step.identity);
        journal.pop_step();
        journal.save(&paths.state)?;
        reversed += 1;
    }
    Ok(reversed)
}

fn reverse_step(step: &Step, paths: &Paths, archive_root: &Path) -> Result<(), Error> {
    match &step.effect {
        Effect::FileWritten { previous } => {
            reverse_file(step, paths, archive_root, previous.as_deref())
        }
        Effect::LinkMade { previous } => {
            reverse_link(step, paths, archive_root, previous.as_deref())
        }
        Effect::DefaultsSet { previous } => {
            reverse_defaults(step, paths, archive_root, previous.as_ref())
        }
        Effect::PackageInstalled => reverse_package(step),
        Effect::ServiceSet { previous } => {
            reverse_service(step, paths, archive_root, previous.as_deref())
        }
        Effect::BrewServiceStarted => reverse_brew_service(step),
        Effect::BinaryInstalled { path } => std::fs::remove_file(path)
            .map_err(|error| apply_error("removing the installed binary", &error)),
        // Irreversible steps are reversed by nobody; the undo verb
        // names them before this point.
        Effect::Irreversible { .. } => Ok(()),
    }
}

fn reverse_file(
    step: &Step,
    paths: &Paths,
    archive_root: &Path,
    previous: Option<&str>,
) -> Result<(), Error> {
    let Some(target) = step.identity.strip_prefix("file:") else {
        return Ok(());
    };
    let target = expand_target(paths, target);
    if let Ok(current) = std::fs::read(&target) {
        archive(archive_root, &step.identity, &current)?;
    }
    match previous {
        Some(digest) => {
            let bytes = read_archived(paths, archive_root, &step.identity, digest)?;
            write_atomic(&target, &bytes)
        }
        None => std::fs::remove_file(&target)
            .map_err(|error| apply_error("removing the created file", &error)),
    }
}

fn reverse_link(
    step: &Step,
    paths: &Paths,
    archive_root: &Path,
    previous: Option<&str>,
) -> Result<(), Error> {
    let Some(target) = step.identity.strip_prefix("link:") else {
        return Ok(());
    };
    let target = expand_target(paths, target);
    if std::fs::symlink_metadata(&target).is_ok() {
        std::fs::remove_file(&target).map_err(|error| apply_error("removing the link", &error))?;
    }
    if let Some(digest) = previous {
        let bytes = read_archived(paths, archive_root, &step.identity, digest)?;
        write_atomic(&target, &bytes)?;
    }
    Ok(())
}
fn reverse_package(step: &Step) -> Result<(), Error> {
    uninstall_package(&crate::model::Identity::parse(&step.identity))
}

/// The one package-uninstall dispatch: undo and orphan removal both
/// route through it. Kinds no installer owns reverse to nothing.
pub fn uninstall_package(identity: &crate::model::Identity) -> Result<(), Error> {
    let deadline = std::time::Duration::from_mins(10);
    let name = &identity.key;
    let result = match &identity.kind {
        Kind::BrewFormula | Kind::BrewCask => {
            crate::brew::uninstall(&identity.kind, name, deadline)
        }
        Kind::Npm => crate::npm::uninstall(name, deadline),
        Kind::Mise => crate::mise::unuse(name, deadline),
        _ => return Ok(()),
    };
    result.map_err(|detail| Error::Apply {
        doing: format!("uninstalling {name}"),
        detail,
    })
}

fn reverse_service(
    step: &Step,
    paths: &Paths,
    archive_root: &Path,
    previous: Option<&str>,
) -> Result<(), Error> {
    let Some(label) = step.identity.strip_prefix("service:") else {
        return Ok(());
    };
    crate::services::bootout(paths, label);
    let target = crate::services::agent_plist(paths, label);
    if let Ok(current) = std::fs::read(&target) {
        archive(archive_root, &step.identity, &current)?;
    }
    match previous {
        Some(digest) => {
            let bytes = read_archived(paths, archive_root, &step.identity, digest)?;
            write_atomic(&target, &bytes)?;
            crate::services::bootstrap(paths, label, false);
        }
        None => {
            let _ = std::fs::remove_file(&target);
        }
    }
    Ok(())
}

fn reverse_brew_service(step: &Step) -> Result<(), Error> {
    let Some(name) = step.identity.strip_prefix("brew.service:") else {
        return Ok(());
    };
    crate::services::brew_service_stop(name).map_err(|detail| Error::Apply {
        doing: format!("stopping the {name} service"),
        detail,
    })
}

fn reverse_defaults(
    step: &Step,
    paths: &Paths,
    archive_root: &Path,
    previous: Option<&Value>,
) -> Result<(), Error> {
    let Some(rest) = step.identity.strip_prefix("defaults:") else {
        return Ok(());
    };
    let Some((domain, key)) = rest.split_once(':') else {
        return Ok(());
    };
    let store = crate::defaults::domain_path(paths, domain);
    if let Ok(bytes) = std::fs::read(&store) {
        archive(archive_root, &step.identity, &bytes)?;
    }
    let mut root = plist::Value::from_file(&store)
        .ok()
        .and_then(plist::Value::into_dictionary)
        .unwrap_or_default();
    match previous {
        Some(value) => {
            root.insert(key.to_string(), crate::defaults::value_to_plist(value));
        }
        None => {
            root.remove(key);
        }
    }
    let mut rendered = Vec::new();
    plist::Value::Dictionary(root)
        .to_writer_binary(&mut rendered)
        .map_err(|error| apply_error("rendering the preference file", &error))?;
    write_atomic(&store, &rendered)
}

fn read_archived(
    paths: &Paths,
    archive_root: &Path,
    identity: &str,
    digest: &str,
) -> Result<Vec<u8>, Error> {
    let path = archive_root.join(sanitize(identity)).join(digest);
    let bytes = std::fs::read(&path).map_err(|error| {
        apply_error(&format!("reading the archived copy for {identity}"), &error)
    })?;
    if crate::secrets::is_sealed(&bytes) {
        return crate::secrets::unseal(paths, &bytes);
    }
    Ok(bytes)
}

//! The engine behind a run: one program, two passes.
//!
//! In plan mode every declaration immediately reads actual state and
//! returns a predicted result, so guards and branches resolve the way
//! they will at execute time. In execute mode the script runs again
//! and effects land in program order — with one exception that is the
//! whole point of batching: consecutive declarations of the same
//! package kind coalesce into one installer invocation. Reading any
//! field of any pending result flushes the batch first, so `.changed`
//! is always the truth and never a guess.

use std::cell::RefCell;
use std::collections::HashMap;
use std::time::Duration;

use crate::apply::{Outcome, perform};
use crate::brew;
use crate::error::Error;
use crate::journal::Journal;
use crate::lockfile::Lockfile;
use crate::model::{Declaration, Identity, Kind};
use crate::paths::Paths;
use crate::plan::{Action, compare};

pub enum Mode {
    /// Read the machine, predict results, change nothing.
    Plan,
    /// Change the machine; `force` lifts the overwrite protection.
    Execute {
        force: bool,
        /// Skip everything that needs administrator rights: the
        /// design's answer for unattended and sandboxed runs.
        skip_privileged: bool,
        /// Act on one unit by name; everything else stands as it is.
        only: Option<String>,
    },
}

/// What a settled resource tells the config: the truth behind the
/// frozen result table.
#[derive(Clone)]
pub struct Truth {
    pub changed: bool,
    pub present: bool,
    pub failed: bool,
    pub version: Option<String>,
}

/// One resource waiting in the package batch.
struct Pending {
    declaration: Declaration,
    optional: bool,
}

pub struct Engine {
    pub mode: Mode,
    pub paths: Paths,
    pub lock: Lockfile,
    pub journal: RefCell<Journal>,
    /// The open apply entry, in execute mode.
    apply_id: Option<u64>,
    batch: RefCell<Vec<Pending>>,
    truths: RefCell<HashMap<Identity, Truth>>,
    /// Planned actions by identity, in declaration order, for the
    /// plan verb's screen.
    items: RefCell<Vec<(Declaration, Action)>>,
    /// How many resources changed so far, for the failure screen's
    /// "applied · not reached" honesty.
    changed: RefCell<usize>,
    protected: RefCell<Vec<String>>,
    /// Restart targets queued by defaults writes, in first-write
    /// order; five writes to one domain restart its process once.
    restarts_pending: RefCell<Vec<String>>,
    restarted: RefCell<Vec<String>>,
    /// Privileged identities left untouched under --no-privileged.
    privileged_skipped: RefCell<Vec<String>>,
    /// Long-run progress, armed by `expect` on the execute pass.
    progress: RefCell<Option<Progress>>,
    /// The engine's own view of the terminal, for the progress line
    /// alone; every other word leaves through the verbs' `Out`.
    screen: crate::out::Out,
}

/// Position in the whole, for the design's long-run line: `12 of 47
/// · 6m · checklist: 2 items open`, with estimates wearing a `~`.
struct Progress {
    total: usize,
    open_checklist: usize,
    done: usize,
    started: std::time::Instant,
    last_emit: std::time::Instant,
    /// Piped runs emit one plain line this often (seconds).
    every: u64,
}

impl Engine {
    pub fn new(mode: Mode, paths: Paths, mut journal: Journal) -> Self {
        let apply_id = match mode {
            Mode::Execute { .. } => Some(journal.begin_apply()),
            Mode::Plan => None,
        };
        let lock = Lockfile::load(&paths).unwrap_or_default();
        Self {
            mode,
            paths,
            lock,
            journal: RefCell::new(journal),
            apply_id,
            batch: RefCell::new(Vec::new()),
            truths: RefCell::new(HashMap::new()),
            items: RefCell::new(Vec::new()),
            changed: RefCell::new(0),
            protected: RefCell::new(Vec::new()),
            restarts_pending: RefCell::new(Vec::new()),
            restarted: RefCell::new(Vec::new()),
            privileged_skipped: RefCell::new(Vec::new()),
            progress: RefCell::new(None),
            screen: crate::out::Out::detect(0),
        }
    }

    /// Arm the long-run progress display: how much work the plan
    /// predicted, and how many checklist items stay open. In CI the
    /// cadence honors `NIWA_PROGRESS_EVERY` seconds (default thirty).
    pub fn expect(&self, total: usize, open_checklist: usize) {
        let every = std::env::var("NIWA_PROGRESS_EVERY")
            .ok()
            .and_then(|value| value.parse().ok())
            .unwrap_or(30);
        *self.progress.borrow_mut() = Some(Progress {
            total,
            open_checklist,
            done: 0,
            started: std::time::Instant::now(),
            last_emit: std::time::Instant::now(),
            every,
        });
    }

    /// One more resource settled; redraw or emit the progress line.
    fn tick(&self, landed: usize) {
        use std::fmt::Write as _;
        let mut slot = self.progress.borrow_mut();
        let Some(progress) = slot.as_mut() else {
            return;
        };
        progress.done += landed;
        let elapsed = progress.started.elapsed().as_secs();
        let mut line = format!(
            "{} of {} · {}",
            progress.done.min(progress.total),
            progress.total,
            humanize(elapsed)
        );
        if progress.done >= 3 && progress.done < progress.total && elapsed >= 5 {
            let remaining =
                elapsed * (progress.total - progress.done) as u64 / progress.done as u64;
            let _ = write!(line, " · ~{} left", humanize(remaining.max(1)));
        }
        if progress.open_checklist > 0 {
            let _ = write!(line, " · checklist: {} items open", progress.open_checklist);
        }
        if self.screen.is_tty() {
            self.screen.progress_line(&line);
        } else if progress.last_emit.elapsed().as_secs() >= progress.every {
            progress.last_emit = std::time::Instant::now();
            self.screen.plain(&line);
        }
    }

    /// Settle one declaration: predict in plan mode, act (or enqueue)
    /// in execute mode. Returns the truth for the result table, or
    /// `None` when the answer is deferred behind the batch barrier.
    pub fn settle(&self, declaration: &Declaration) -> Result<Option<Truth>, Error> {
        match &self.mode {
            Mode::Plan => {
                let action = {
                    let journal = self.journal.borrow();
                    compare(declaration, &self.paths, &journal)
                };
                let truth = truth_of(&action);
                self.items.borrow_mut().push((declaration.clone(), action));
                Ok(Some(truth))
            }
            Mode::Execute {
                force,
                skip_privileged,
                only,
            } => {
                if let Some(only) = only
                    && !declaration.unit.is_named(only)
                {
                    // Outside the named module nothing moves; the
                    // result reads as the machine stands.
                    return Ok(Some(Truth {
                        changed: false,
                        present: true,
                        failed: false,
                        version: None,
                    }));
                }
                if *skip_privileged && declaration.privileged {
                    // Left exactly as it is, counted, and named in
                    // the summary — never attempted without rights.
                    self.privileged_skipped
                        .borrow_mut()
                        .push(declaration.identity.to_string());
                    return Ok(Some(Truth {
                        changed: false,
                        present: true,
                        failed: false,
                        version: None,
                    }));
                }
                if batchable(&declaration.identity.kind) {
                    self.batch.borrow_mut().push(Pending {
                        declaration: declaration.clone(),
                        optional: is_optional(declaration),
                    });
                    return Ok(None);
                }
                // Program order: anything else lands only after the
                // pending packages do.
                self.flush()?;
                let force = *force;
                let truth = self.perform_now(declaration, force)?;
                if truth.changed {
                    self.tick(1);
                }
                Ok(Some(truth))
            }
        }
    }

    /// The truth for an identity whose result was deferred. Flushes
    /// the batch first: that is the barrier rule.
    pub fn resolve(&self, identity: &Identity) -> Result<Truth, Error> {
        self.flush()?;
        Ok(self
            .truths
            .borrow()
            .get(identity)
            .cloned()
            .unwrap_or(Truth {
                changed: false,
                present: false,
                failed: true,
                version: None,
            }))
    }

    /// A custom kind settles through its own Lua handlers: the API
    /// layer runs `check` and `apply` and reports back; the engine
    /// owns privilege, program order, the journal, and the plan
    /// screen. `None` means proceed to the handlers; a truth means
    /// the resource settled without running them.
    pub fn custom_gate(&self, declaration: &Declaration) -> Result<Option<Truth>, Error> {
        match &self.mode {
            Mode::Plan => Ok(None),
            Mode::Execute {
                skip_privileged,
                only,
                ..
            } => {
                if let Some(only) = only
                    && !declaration.unit.is_named(only)
                {
                    return Ok(Some(Truth {
                        changed: false,
                        present: true,
                        failed: false,
                        version: None,
                    }));
                }
                if *skip_privileged && declaration.privileged {
                    self.privileged_skipped
                        .borrow_mut()
                        .push(declaration.identity.to_string());
                    return Ok(Some(Truth {
                        changed: false,
                        present: true,
                        failed: false,
                        version: None,
                    }));
                }
                // Program order: pending packages land first.
                self.flush()?;
                Ok(None)
            }
        }
    }

    /// Plan mode: the kind's own check verdict becomes the plan
    /// line, described in the kind's own words.
    pub fn custom_planned(
        &self,
        declaration: &Declaration,
        in_sync: bool,
        describe: &str,
    ) -> Truth {
        let action = if in_sync {
            Action::InSync
        } else {
            Action::Change {
                detail: describe.to_string(),
            }
        };
        let truth = truth_of(&action);
        self.items.borrow_mut().push((declaration.clone(), action));
        truth
    }

    /// Execute mode: record what the kind's apply did. The journal
    /// marks the change irreversible by name — driving the Lua
    /// `reverse` handler from undo lands after 0.1.0.
    pub fn custom_applied(
        &self,
        declaration: &Declaration,
        describe: &str,
        changed: bool,
    ) -> Result<Truth, Error> {
        if changed {
            let mut journal = self.journal.borrow_mut();
            if let Some(id) = self.apply_id {
                journal.record_step(
                    id,
                    crate::journal::Step {
                        identity: declaration.identity.to_string(),
                        effect: crate::journal::Effect::Irreversible {
                            what: describe.to_string(),
                        },
                    },
                );
            }
            journal.save(&self.paths.state)?;
            drop(journal);
            *self.changed.borrow_mut() += 1;
            self.tick(1);
        }
        Ok(Truth {
            changed,
            present: true,
            failed: false,
            version: None,
        })
    }

    /// Run the pending package batch as one installer invocation per
    /// kind, then read the receipts back for the truth.
    pub fn flush(&self) -> Result<(), Error> {
        let pending = std::mem::take(&mut *self.batch.borrow_mut());
        if pending.is_empty() {
            return Ok(());
        }

        // What is already present costs nothing; only the missing
        // names go to the installer.
        let mut to_install: Vec<&Pending> = Vec::new();
        for entry in &pending {
            let installed = self.installed(&entry.declaration);
            if let Some(version) = installed {
                self.truths.borrow_mut().insert(
                    entry.declaration.identity.clone(),
                    Truth {
                        changed: false,
                        present: true,
                        failed: false,
                        version: Some(version),
                    },
                );
                acknowledge(&self.journal, &entry.declaration);
            } else {
                to_install.push(entry);
            }
        }

        for kind in [Kind::BrewFormula, Kind::BrewCask, Kind::Npm, Kind::Mise] {
            let group: Vec<&&Pending> = to_install
                .iter()
                .filter(|entry| entry.declaration.identity.kind == kind)
                .collect();
            if group.is_empty() {
                continue;
            }
            let invocation = match &kind {
                Kind::Npm => {
                    let names: Vec<String> = group
                        .iter()
                        .map(|entry| entry.declaration.identity.key.clone())
                        .collect();
                    crate::npm::install(&names, Duration::from_mins(30))
                }
                Kind::Mise => {
                    let requests: Vec<String> = group
                        .iter()
                        .map(|entry| crate::mise::request(&entry.declaration, &self.lock))
                        .collect();
                    crate::mise::install(&requests, Duration::from_mins(30))
                }
                _ => {
                    let names: Vec<String> = group
                        .iter()
                        .map(|entry| entry.declaration.identity.key.clone())
                        .collect();
                    brew::install(&kind, &names, Duration::from_mins(30))
                }
            };

            for entry in to_install
                .iter()
                .filter(|entry| entry.declaration.identity.kind == kind)
            {
                let version = self.installed(&entry.declaration);
                let landed = version.is_some();
                self.truths.borrow_mut().insert(
                    entry.declaration.identity.clone(),
                    Truth {
                        changed: landed,
                        present: landed,
                        failed: !landed,
                        version,
                    },
                );
                if landed {
                    *self.changed.borrow_mut() += 1;
                    self.tick(1);
                    acknowledge(&self.journal, &entry.declaration);
                    if let Some(id) = self.apply_id {
                        self.journal.borrow_mut().record_step(
                            id,
                            crate::journal::Step {
                                identity: entry.declaration.identity.to_string(),
                                effect: crate::journal::Effect::PackageInstalled,
                            },
                        );
                    }
                    self.journal.borrow().save(&self.paths.state)?;
                } else if !entry.optional {
                    // A failed resource throws by default, halting
                    // the run rather than cascading.
                    return Err(Error::ResourceFailed {
                        identity: entry.declaration.identity.to_string(),
                        provenance: entry.declaration.provenance.to_string(),
                        command: invocation.command.clone(),
                        code: invocation.code,
                        stderr: invocation.stderr_tail,
                    });
                }
            }
        }
        Ok(())
    }

    /// Is a batchable declaration already satisfied? Returns a
    /// version-ish string when it is; npm has no cheap version, so
    /// presence answers with an empty marker.
    fn installed(&self, declaration: &Declaration) -> Option<String> {
        match &declaration.identity.kind {
            Kind::Npm => crate::npm::installed(&declaration.identity.key).then(String::new),
            Kind::Mise => crate::mise::installed(&self.paths, &declaration.identity.key),
            _ => brew::installed(
                &self.paths,
                &declaration.identity.kind,
                &declaration.identity.key,
            ),
        }
    }

    fn perform_now(&self, declaration: &Declaration, force: bool) -> Result<Truth, Error> {
        let mut journal = self.journal.borrow_mut();
        let (outcome, effect) = perform(declaration, &self.paths, &mut journal, &self.lock, force)?;
        if let (Some(id), Some(effect)) = (self.apply_id, effect) {
            journal.record_step(
                id,
                crate::journal::Step {
                    identity: declaration.identity.to_string(),
                    effect,
                },
            );
        }
        journal.save(&self.paths.state)?;
        drop(journal);
        match outcome {
            Outcome::Done => {
                *self.changed.borrow_mut() += 1;
                self.queue_restart(declaration);
            }
            Outcome::Protected => self
                .protected
                .borrow_mut()
                .push(declaration.identity.to_string()),
            Outcome::InSync | Outcome::Unchecked => {}
        }
        Ok(match outcome {
            Outcome::Done => Truth {
                changed: true,
                present: true,
                failed: false,
                version: None,
            },
            Outcome::InSync | Outcome::Protected | Outcome::Unchecked => Truth {
                changed: false,
                present: true,
                failed: false,
                version: None,
            },
        })
    }

    /// The plan pass's items, in declaration order.
    pub fn into_items(self) -> Vec<crate::plan::Item> {
        self.items
            .into_inner()
            .into_iter()
            .map(|(declaration, action)| crate::plan::Item {
                declaration,
                action,
            })
            .collect()
    }

    /// Close an execute pass: run whatever the batch still holds,
    /// restart what the defaults writes asked for (once per process),
    /// drop an apply entry that changed nothing, save.
    pub fn finish(&self) -> Result<(), Error> {
        self.flush()?;
        self.screen.progress_clear();
        for target in self.restarts_pending.borrow_mut().drain(..) {
            let killed = crate::util::proc::bounded_output(
                "killall",
                &[target.as_str()],
                Duration::from_secs(10),
            )
            .is_some_and(|finished| finished.code == Some(0));
            if killed {
                self.restarted.borrow_mut().push(target);
            }
        }
        if let Some(id) = self.apply_id {
            self.journal.borrow_mut().discard_empty_apply(id);
        }
        self.journal.borrow().save(&self.paths.state)
    }

    /// A defaults write asks for its process restart; the queue keeps
    /// one entry per target, so five writes bounce the Dock once.
    fn queue_restart(&self, declaration: &Declaration) {
        if !matches!(declaration.identity.kind, Kind::Defaults) {
            return;
        }
        let crate::model::Value::Map(fields) = &declaration.spec else {
            return;
        };
        let Some(crate::model::Value::Str(target)) = fields.get("restart") else {
            return;
        };
        let mut pending = self.restarts_pending.borrow_mut();
        if !pending.iter().any(|queued| queued == target) {
            pending.push(target.clone());
        }
    }

    /// The processes this run actually bounced, in order.
    pub fn restarted(&self) -> Vec<String> {
        self.restarted.borrow().clone()
    }

    /// What --no-privileged left for a privileged run.
    pub fn privileged_skipped(&self) -> Vec<String> {
        self.privileged_skipped.borrow().clone()
    }

    /// Close a failed execute pass: keep what landed for undo, but
    /// never keep an empty entry.
    pub fn abort(&self) {
        if let Some(id) = self.apply_id {
            self.journal.borrow_mut().discard_empty_apply(id);
        }
        let _ = self.journal.borrow().save(&self.paths.state);
    }

    pub fn changed_count(&self) -> usize {
        *self.changed.borrow()
    }

    pub fn protected(&self) -> Vec<String> {
        self.protected.borrow().clone()
    }
}

const fn batchable(kind: &Kind) -> bool {
    matches!(
        kind,
        Kind::BrewFormula | Kind::BrewCask | Kind::Npm | Kind::Mise
    )
}

fn is_optional(declaration: &Declaration) -> bool {
    match &declaration.spec {
        crate::model::Value::Map(fields) => matches!(
            fields.get("optional"),
            Some(crate::model::Value::Bool(true))
        ),
        _ => false,
    }
}

fn acknowledge(journal: &RefCell<Journal>, declaration: &Declaration) {
    journal.borrow_mut().acknowledge(
        declaration.identity.to_string(),
        crate::journal::Acknowledgement::new(declaration.spec.clone(), None),
    );
}

/// Elapsed time in the voice rules' shape: seconds young, minutes
/// soon, hours eventually.
fn humanize(seconds: u64) -> String {
    match seconds {
        0..=89 => format!("{seconds}s"),
        90..=5_399 => format!("{}m", seconds.div_ceil(60)),
        _ => format!("{}h", seconds / 3600),
    }
}

const fn truth_of(action: &Action) -> Truth {
    let (changed, present) = match action {
        Action::InSync | Action::Unchecked => (false, true),
        Action::Create => (true, false),
        Action::Change { .. } => (true, true),
    };
    Truth {
        changed,
        present,
        failed: false,
        version: None,
    }
}

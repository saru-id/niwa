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
use crate::model::{Declaration, Identity, Kind};
use crate::paths::Paths;
use crate::plan::{Action, compare};

pub enum Mode {
    /// Read the machine, predict results, change nothing.
    Plan,
    /// Change the machine; `force` lifts the overwrite protection.
    Execute { force: bool },
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
}

impl Engine {
    pub fn new(mode: Mode, paths: Paths, mut journal: Journal) -> Self {
        let apply_id = match mode {
            Mode::Execute { .. } => Some(journal.begin_apply()),
            Mode::Plan => None,
        };
        Self {
            mode,
            paths,
            journal: RefCell::new(journal),
            apply_id,
            batch: RefCell::new(Vec::new()),
            truths: RefCell::new(HashMap::new()),
            items: RefCell::new(Vec::new()),
            changed: RefCell::new(0),
            protected: RefCell::new(Vec::new()),
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
            Mode::Execute { force } => {
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
            let installed = brew::installed(
                &self.paths,
                &entry.declaration.identity.kind,
                &entry.declaration.identity.key,
            );
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

        for kind in [Kind::BrewFormula, Kind::BrewCask] {
            let names: Vec<String> = to_install
                .iter()
                .filter(|entry| entry.declaration.identity.kind == kind)
                .map(|entry| entry.declaration.identity.key.clone())
                .collect();
            if names.is_empty() {
                continue;
            }
            let invocation = brew::install(&kind, &names, Duration::from_mins(30));

            for entry in to_install
                .iter()
                .filter(|entry| entry.declaration.identity.kind == kind)
            {
                let name = &entry.declaration.identity.key;
                let version = brew::installed(&self.paths, &kind, name);
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

    fn perform_now(&self, declaration: &Declaration, force: bool) -> Result<Truth, Error> {
        let mut journal = self.journal.borrow_mut();
        let (outcome, effect) = perform(declaration, &self.paths, &mut journal, force)?;
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
            Outcome::Done => *self.changed.borrow_mut() += 1,
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
    /// drop an apply entry that changed nothing, save.
    pub fn finish(&self) -> Result<(), Error> {
        self.flush()?;
        if let Some(id) = self.apply_id {
            self.journal.borrow_mut().discard_empty_apply(id);
        }
        self.journal.borrow().save(&self.paths.state)
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
    matches!(kind, Kind::BrewFormula | Kind::BrewCask)
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
        crate::journal::Acknowledgement {
            spec: declaration.spec.clone(),
            bytes: None,
        },
    );
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

//! `niwa apply`: one program, two passes. The plan pass predicts and
//! nothing more; after one confirmation the script runs again with
//! effects live, in program order, packages batching until a barrier.
//! Exit 0 on success, 1 on an error. `--yes` skips the confirmation
//! and refuses a dirty config tree unless `--dirty` says you truly
//! mean it. `--verify` re-checks everything after the run and names
//! anything not idempotent.

use std::io::IsTerminal as _;
use std::process::ExitCode;
use std::rc::Rc;
use std::time::Duration;

use crate::apply::Lock;
use crate::engine::{Engine, Mode};
use crate::error::Error;
use crate::journal::Journal;
use crate::model::action::Action;
use crate::out::{Mark, Out, count};
use crate::paths::Paths;
use crate::util::proc::bounded_stdout;

#[allow(
    clippy::struct_excessive_bools,
    reason = "these mirror four independent command line flags"
)]
pub struct Options {
    pub yes: bool,
    pub dirty: bool,
    pub force: bool,
    pub verify: bool,
    pub no_privileged: bool,
    pub only: Option<String>,
    pub sandbox: bool,
}

pub fn run(out: &Out, options: &Options) -> ExitCode {
    match apply(out, options) {
        Ok(code) => code,
        Err(error) => {
            out.error(&error);
            ExitCode::FAILURE
        }
    }
}

fn apply(out: &Out, options: &Options) -> Result<ExitCode, Error> {
    let paths = Paths::resolve()?;

    if options.sandbox {
        return sandbox_rehearsal(out, &paths);
    }

    // A tree mid-merge is nobody's config: refuse plainly, dirty
    // flag or not, until the person finishes or aborts the merge.
    if paths.config.join(".git/MERGE_HEAD").exists() {
        return Err(Error::Apply {
            doing: "applying".to_string(),
            detail: "the config tree is mid-merge · finish or abort the merge first".to_string(),
        });
    }

    // Unattended, a dirty tree means someone forgot to commit, and an
    // apply nobody watched would poison the stamp's honesty.
    if options.yes && !options.dirty && tree_is_dirty(&paths) {
        return Err(Error::DirtyTree);
    }

    let _lock = Lock::take(&paths.state)?;

    // Pass one: predict.
    let journal = Journal::load(&paths.state)?;
    let plan_engine = Rc::new(Engine::new(Mode::Plan, paths.clone(), journal, out.clone()));
    super::run_pass(&paths, Some(Rc::clone(&plan_engine)))?;
    let mut intent = super::plan_of(plan_engine);

    scope_to_only(&mut intent, options.only.as_deref())?;

    let pending = intent.pending();
    if pending == 0 {
        let line = format!("{} · nothing to do", count(intent.items.len(), "resource"));
        out.result(Mark::Ok, &line);
        stamp_and_warn(out, &paths, intent.items.len());
        return Ok(ExitCode::SUCCESS);
    }

    super::plan::render_pending(out, &intent);

    checklist_up_front(out, &intent, pending);

    let declined = if options.yes {
        std::collections::HashSet::new()
    } else {
        if !std::io::stdin().is_terminal() {
            return Err(Error::NeedsConfirmation);
        }
        let Some(declined) = walk(out, &paths, &intent) else {
            out.result(Mark::Ok, "canceled · nothing changed");
            return Ok(ExitCode::FAILURE);
        };
        declined
    };
    if declined.len() >= pending {
        out.result(Mark::Ok, "everything passed over · nothing changed");
        return Ok(ExitCode::SUCCESS);
    }

    // Pass two: the same program, effects live.
    let mut journal = Journal::load(&paths.state)?;
    journal.set_context_commit(crate::stamp::config_commit(&paths).0);
    let engine = Rc::new(Engine::new(
        Mode::Execute {
            force: options.force,
            skip_privileged: options.no_privileged,
            only: options.only.clone(),
            declined,
        },
        paths.clone(),
        journal,
        out.clone(),
    ));
    let prefetches = arm_progress(&engine, &paths, &intent, pending);

    let run = super::run_pass(&paths, Some(Rc::clone(&engine))).and_then(|_| engine.finish());
    for handle in prefetches {
        let _ = handle.join();
    }
    if let Err(error) = run {
        engine.abort();
        let applied = engine.changed_count();
        out.error(&error);
        out.result(
            Mark::Failed,
            &format!(
                "{} applied · {} not reached · re-run to continue (done work is skipped)",
                count(applied, "change"),
                pending.saturating_sub(applied)
            ),
        );
        return Ok(ExitCode::FAILURE);
    }

    summarize(out, &engine, &intent);

    stamp_and_warn(out, &paths, intent.items.len());

    // The safety net has a horizon: archives the newest apply cannot
    // reach and ninety days old go quietly.
    if let Ok(journal) = crate::journal::Journal::load(&paths.state) {
        crate::apply::prune_archives(&paths, &journal);
    }

    let skipped = engine.privileged_skipped();
    if !skipped.is_empty() {
        out.note(&format!(
            "{} need administrator rights and were left as they are",
            count(skipped.len(), "step")
        ));
    }

    if options.verify {
        return Ok(verify(
            out,
            &paths,
            options.no_privileged,
            options.only.as_deref(),
        ));
    }
    Ok(ExitCode::SUCCESS)
}

/// Interactive apply: every remaining difference, one decision at a
/// time. `d` shows the same diff `plan --diff` renders; `a` switches
/// to unattended once trust is established. `None` means canceled.
fn walk(
    out: &Out,
    paths: &Paths,
    intent: &crate::model::action::Plan,
) -> Option<std::collections::HashSet<String>> {
    let mut declined = std::collections::HashSet::new();
    let mut all = false;
    for item in &intent.items {
        if !matches!(item.action, Action::Create | Action::Change { .. }) {
            continue;
        }
        if all {
            continue;
        }
        loop {
            eprint!(
                "{} · [y]es [s]kip [d]iff [a]ll [q]uit ",
                item.declaration.identity
            );
            let mut answer = String::new();
            if std::io::stdin().read_line(&mut answer).is_err() {
                return None;
            }
            match answer.trim() {
                "y" | "" => break,
                "s" => {
                    declined.insert(item.declaration.identity.to_string());
                    break;
                }
                "d" => super::plan::render_item_diff(out, paths, item),
                "a" => {
                    all = true;
                    break;
                }
                "q" => return None,
                _ => {}
            }
        }
    }
    Some(declined)
}

/// The run's closing lines: what changed, what restarted, and what
/// stayed protected because a person's edits live there.
fn summarize(out: &Out, engine: &Engine, intent: &crate::model::action::Plan) {
    let checked = intent.items.len() - intent.unchecked();
    let mut summary = format!("{checked} checked · {} changed", engine.changed_count());
    let protected = engine.protected();
    if !protected.is_empty() {
        use std::fmt::Write as _;
        let _ = write!(summary, " · {} protected", protected.len());
    }
    out.result(Mark::Ok, &summary);
    for target in engine.restarted() {
        out.result(Mark::Restarted, &format!("{target} restarted (once)"));
    }
    for identity in &protected {
        out.note(&format!(
            "{identity} holds edits niwa never wrote: pull them home, or apply --force"
        ));
    }
}

/// Write the stamp, and say so when this machine's id already stamps
/// under another name — renaming a Mac must never silently orphan its
/// host file.
fn stamp_and_warn(out: &Out, paths: &Paths, resources: usize) {
    let name = crate::facts::Facts::gather(paths).name;
    if name.is_empty() {
        return;
    }
    let this_machine = crate::stamp::machine_id(paths);
    for (stem, stamp) in crate::stamp::read_all(paths) {
        if stamp.machine_id == this_machine && stem != name {
            out.note(&format!(
                "this machine was \"{stem}\", now \"{name}\": rename hosts/{stem}.luau and state/{stem}.toml to match"
            ));
        }
    }
    if let Err(error) = crate::stamp::write(paths, &name, resources) {
        out.note(&format!("the stamp was not written: {error}"));
    }
}

/// The literal definition of idempotence: re-read everything, demand
/// silence, and name the resource and source line of anything that
/// still reports a change.
/// `--sandbox`: does this config actually work from nothing? Files
/// and links land in a throwaway home; packages settle against an
/// empty prefix and are counted, never installed. The real machine
/// is not touched, which is the whole point.
fn sandbox_rehearsal(out: &Out, real: &Paths) -> Result<ExitCode, Error> {
    let scratch = std::env::temp_dir().join(format!("niwa-sandbox-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&scratch);
    let paths = real.sandboxed(&scratch);
    for dir in [&paths.home, &paths.state, &paths.brew_prefix, &paths.data] {
        std::fs::create_dir_all(dir).map_err(|error| Error::Apply {
            doing: "building the sandbox".to_string(),
            detail: error.to_string(),
        })?;
    }
    let verdict = rehearse(out, &paths);
    let _ = std::fs::remove_dir_all(&scratch);
    verdict
}

fn rehearse(out: &Out, paths: &Paths) -> Result<ExitCode, Error> {
    let journal = Journal::load(&paths.state)?;
    let engine = Rc::new(Engine::new(Mode::Plan, paths.clone(), journal, out.clone()));
    super::run_pass(paths, Some(Rc::clone(&engine)))?;
    let intent = super::plan_of(engine);

    let mut journal = Journal::load(&paths.state)?;
    let lock = crate::lockfile::Lockfile::load(paths)?;
    let mut files = 0usize;
    let mut packages = 0usize;
    for item in &intent.items {
        if !matches!(item.action, Action::Create | Action::Change { .. }) {
            continue;
        }
        match &item.declaration.identity.kind {
            crate::model::Kind::File | crate::model::Kind::Link => {
                crate::apply::perform(&item.declaration, paths, &mut journal, &lock, false)?;
                files += 1;
            }
            crate::model::Kind::BrewFormula
            | crate::model::Kind::BrewCask
            | crate::model::Kind::Npm
            | crate::model::Kind::Mise
            | crate::model::Kind::GithubRelease => packages += 1,
            _ => {}
        }
    }
    out.result(
        Mark::Ok,
        &format!(
            "works from nothing · {} landed · {} would install",
            count(files, "file"),
            count(packages, "package")
        ),
    );
    Ok(ExitCode::SUCCESS)
}

/// Arm the long-run progress line and start the background
/// downloads. Effects still land in program order: the install
/// re-verifies and downloads for itself when the cache is not ready.
fn arm_progress(
    engine: &Engine,
    paths: &Paths,
    intent: &crate::model::action::Plan,
    pending: usize,
) -> Vec<std::thread::JoinHandle<()>> {
    let open_checklist = intent
        .items
        .iter()
        .filter(|item| {
            matches!(
                item.declaration.identity.kind,
                crate::model::Kind::Permission | crate::model::Kind::Manual
            )
        })
        .count();
    // In CI the cadence honors NIWA_PROGRESS_EVERY seconds; thirty is
    // the design's one-plain-line-per-half-minute rule.
    let every = std::env::var("NIWA_PROGRESS_EVERY")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(30);
    engine.expect(pending, open_checklist, every);
    spawn_prefetches(paths, intent)
}

/// Every pending release download starts now, in the background;
/// each thread is bounded by its own network deadlines.
fn spawn_prefetches(
    paths: &Paths,
    intent: &crate::model::action::Plan,
) -> Vec<std::thread::JoinHandle<()>> {
    let Ok(lock) = crate::lockfile::Lockfile::load(paths) else {
        return Vec::new();
    };
    intent
        .items
        .iter()
        .filter(|item| {
            matches!(item.action, Action::Create | Action::Change { .. })
                && item.declaration.identity.kind == crate::model::Kind::GithubRelease
        })
        .filter_map(|item| {
            let repo = item.declaration.identity.key.clone();
            let pin = lock.github_release.get(&repo)?.clone();
            let paths = paths.clone();
            Some(std::thread::spawn(move || {
                crate::release::prefetch(&paths, &repo, &pin);
            }))
        })
        .collect()
}

/// `--only` scopes the run to one unit; a name nothing answers to is
/// a refusal, not a silent no-op.
fn scope_to_only(intent: &mut crate::model::action::Plan, only: Option<&str>) -> Result<(), Error> {
    let Some(only) = only else {
        return Ok(());
    };
    if !intent
        .items
        .iter()
        .any(|item| item.declaration.unit.is_named(only))
    {
        return Err(Error::Apply {
            doing: format!("applying --only {only}"),
            detail: "no module or host has that name".to_string(),
        });
    }
    intent
        .items
        .retain(|item| item.declaration.unit.is_named(only));
    Ok(())
}

/// On a long run the human steps arrive up front, so hands can work
/// while the machine does: nothing in the checklist ever blocks the
/// apply.
fn checklist_up_front(out: &Out, intent: &crate::model::action::Plan, pending: usize) {
    let manual: Vec<&crate::model::action::Item> = intent
        .items
        .iter()
        .filter(|item| {
            matches!(
                item.declaration.identity.kind,
                crate::model::Kind::Permission | crate::model::Kind::Manual
            )
        })
        .collect();
    if pending >= 10 && !manual.is_empty() {
        out.plain("");
        out.group("yours meanwhile");
        for item in manual {
            out.result(Mark::Busy, &item.declaration.identity.key);
        }
    }
}

fn verify(out: &Out, paths: &Paths, ignore_privileged: bool, only: Option<&str>) -> ExitCode {
    let second = Journal::load(&paths.state).and_then(|journal| {
        let engine = Rc::new(Engine::new(Mode::Plan, paths.clone(), journal, out.clone()));
        super::run_pass(paths, Some(Rc::clone(&engine)))?;
        Ok(super::plan_of(engine))
    });
    let second = match second {
        Ok(second) => second,
        Err(error) => {
            out.error(&error);
            return ExitCode::FAILURE;
        }
    };
    let unsettled: Vec<String> = second
        .items
        .iter()
        .filter(|item| matches!(item.action, Action::Create | Action::Change { .. }))
        .filter(|item| !(ignore_privileged && item.declaration.privileged))
        .filter(|item| only.is_none_or(|only| item.declaration.unit.is_named(only)))
        .map(|item| {
            format!(
                "{} ({})",
                item.declaration.identity, item.declaration.provenance
            )
        })
        .collect();
    if unsettled.is_empty() {
        out.result(Mark::Ok, "verified · a second pass changes nothing");
        return ExitCode::SUCCESS;
    }
    out.result(Mark::Failed, "not idempotent");
    for line in &unsettled {
        out.note(line);
    }
    ExitCode::FAILURE
}

/// Is the config repo's working tree dirty? A config that is not a
/// git repository has nothing to be dirty.
fn tree_is_dirty(paths: &Paths) -> bool {
    if !paths.config.join(".git").exists() {
        return false;
    }
    // Stamps under state/ dirty the tree after every apply by
    // design; they never count against an unattended run.
    let config = paths.config.display().to_string();
    bounded_stdout(
        "git",
        &[
            "-C",
            &config,
            "status",
            "--porcelain",
            "--",
            ".",
            ":(exclude)state",
        ],
        Duration::from_secs(10),
    )
    .is_some_and(|status| !status.is_empty())
}

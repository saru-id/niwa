//! Plain `niwa`: the home screen. Everything the tool knows, in one
//! screen, in the shape `:Lazy` taught everyone to read. Every key it
//! accepts is printed on the screen; everything a key does, a verb
//! does — the dashboard is a view, never a separate power.

use std::io::IsTerminal as _;
use std::process::ExitCode;
use std::rc::Rc;

use crate::drift::{Baseline, survey};
use crate::engine::{Engine, Mode};
use crate::error::Error;
use crate::journal::Journal;
use crate::model::Kind;
use crate::out::{Mark, Out, count};
use crate::paths::Paths;

pub fn run(out: &Out) -> ExitCode {
    match dashboard(out) {
        Ok(code) => code,
        Err(error) => {
            out.error(&error);
            ExitCode::FAILURE
        }
    }
}

fn dashboard(out: &Out) -> Result<ExitCode, Error> {
    let paths = Paths::resolve()?;

    let journal = Journal::load(&paths.state)?;
    let engine = Rc::new(Engine::new(Mode::Plan, paths.clone(), journal, out.clone()));
    let analysis = super::run_pass(&paths, Some(Rc::clone(&engine)))?;
    let plan = super::plan_of(engine);
    let pending = plan.pending();

    let journal = Journal::load(&paths.state)?;
    let mut baseline = Baseline::load(&paths.state);
    let proposals = survey(&paths, &journal, &analysis.effective, &mut baseline)
        .findings
        .len();
    baseline.save(&paths.state);

    let facts = crate::facts::Facts::gather(&paths);
    // A ticked step stays ticked while the world it was ticked in
    // stands; a reinstall or a macOS major re-arms it by itself.
    let open_steps: Vec<&crate::model::Declaration> = analysis
        .effective
        .iter()
        .filter(|declaration| matches!(declaration.identity.kind, Kind::Permission | Kind::Manual))
        .filter(|declaration| {
            journal
                .acknowledged(&declaration.identity.to_string())
                .and_then(|ack| ack.context.as_deref())
                != Some(step_context(&facts, &declaration.identity).as_str())
        })
        .collect();
    let manual = open_steps.len();

    let name = facts.name.clone();
    let applied = crate::stamp::read_all(&paths)
        .into_iter()
        .find(|(stem, _)| stem == &name)
        .map(|(_, stamp)| out.when(&stamp.applied));

    let mut headline = if name.is_empty() {
        format!("niwa · {}", count(analysis.effective.len(), "resource"))
    } else {
        format!(
            "niwa · {name} · {}",
            count(analysis.effective.len(), "resource")
        )
    };
    if let Some(applied) = applied {
        use std::fmt::Write as _;
        let _ = write!(headline, " · last applied {applied}");
    }
    out.plain(&headline);
    out.plain("");

    if pending > 0 {
        out.result(Mark::Busy, &format!("{pending} would change"));
    }
    if proposals > 0 {
        out.result(
            Mark::Busy,
            &format!("{} · niwa pull to review", count(proposals, "proposal")),
        );
    }
    let outdated = outdated_line(out, &paths);
    if manual > 0 {
        out.result(
            Mark::Busy,
            &format!("{} in the checklist", count(manual, "manual step")),
        );
    }
    if pending == 0 && proposals == 0 && outdated == 0 {
        out.result(Mark::Ok, "in sync · nothing waiting");
    }
    // The keys work where a terminal is attached; piped output is the
    // screen alone.
    if !std::io::stdin().is_terminal() {
        return Ok(ExitCode::SUCCESS);
    }
    out.plain("");
    if manual > 0 {
        out.plain("[a]pply  [p]lan  [r]eview  [t]ick  [u]pdate  [h]istory  [q]uit");
    } else {
        out.plain("[a]pply  [p]lan  [r]eview  [u]pdate  [h]istory  [q]uit");
    }
    let mut line = String::new();
    if std::io::stdin().read_line(&mut line).is_err() {
        return Ok(ExitCode::SUCCESS);
    }
    Ok(match line.trim() {
        "a" => super::apply_verb::run(
            out,
            &super::apply_verb::Options {
                yes: false,
                dirty: false,
                force: false,
                verify: false,
                no_privileged: false,
                only: None,
                sandbox: false,
            },
        ),
        "p" => super::plan::run(out, false, false),
        "r" => super::pull::run(out, false),
        "t" if manual > 0 => tick(out, &paths, &facts, &open_steps),
        "u" => super::update::run(out, None),
        "h" => super::history::run(out),
        _ => ExitCode::SUCCESS,
    })
}

/// The watcher's warm answer: outdated counts wait here for your
/// visit instead of pinging you. Returns the total shown.
fn outdated_line(out: &Out, paths: &Paths) -> usize {
    crate::upstream::Digest::load(paths)
        .filter(|digest| !digest.is_stale())
        .map_or(0, |digest| {
            let total = digest.brew_outdated + digest.lock_outdated;
            if total > 0 {
                out.result(
                    Mark::Busy,
                    &format!(
                        "{total} outdated · brew {} · lock {}",
                        digest.brew_outdated, digest.lock_outdated
                    ),
                );
            }
            total
        })
}

/// Tick one checklist step off, remembering the world it was ticked
/// in. Ticking is the person's act; niwa never guesses it happened.
fn tick(
    out: &Out,
    paths: &Paths,
    facts: &crate::facts::Facts,
    steps: &[&crate::model::Declaration],
) -> ExitCode {
    for (index, step) in steps.iter().enumerate() {
        out.plain(&format!("{} · {}", index + 1, step.identity.key));
    }
    out.plain("which one is done? (a number, or enter to cancel)");
    let mut line = String::new();
    if std::io::stdin().read_line(&mut line).is_err() {
        return ExitCode::SUCCESS;
    }
    let Some(step) = line
        .trim()
        .parse::<usize>()
        .ok()
        .and_then(|n| n.checked_sub(1))
        .and_then(|n| steps.get(n))
    else {
        return ExitCode::SUCCESS;
    };
    let result = crate::apply::Lock::take(&paths.state).and_then(|(_lock, _)| {
        let mut journal = Journal::load(&paths.state)?;
        let mut ack = crate::journal::Acknowledgement::new(step.spec.clone(), None);
        ack.context = Some(step_context(facts, &step.identity));
        journal.acknowledge(step.identity.to_string(), ack);
        journal.save(&paths.state)
    });
    match result {
        Ok(()) => {
            out.result(Mark::Ok, &format!("{} · ticked", step.identity.key));
            ExitCode::SUCCESS
        }
        Err(error) => {
            out.error(&error);
            ExitCode::FAILURE
        }
    }
}

/// The world a tick lives in: the macOS major, and for a permission,
/// the app bundle's install time. Either moving re-arms the step.
fn step_context(facts: &crate::facts::Facts, identity: &crate::model::Identity) -> String {
    let major = facts.os.split('.').next().unwrap_or_default();
    let mut context = format!("macos {major}");
    if matches!(identity.kind, Kind::Permission)
        && let Some(app) = identity.key.split(':').next()
    {
        let bundle = std::path::Path::new("/Applications").join(format!("{app}.app"));
        if let Ok(modified) = std::fs::metadata(&bundle).and_then(|meta| meta.modified())
            && let Ok(stamp) = modified.duration_since(std::time::UNIX_EPOCH)
        {
            use std::fmt::Write as _;
            let _ = write!(context, " · app {}", stamp.as_secs());
        }
    }
    context
}

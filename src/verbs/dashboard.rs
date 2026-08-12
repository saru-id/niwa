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
    let engine = Rc::new(Engine::new(Mode::Plan, paths.clone(), journal));
    let analysis = super::run_pass(&paths, Some(Rc::clone(&engine)))?;
    let plan = super::plan_of(engine);
    let pending = plan.pending();

    let journal = Journal::load(&paths.state)?;
    let mut baseline = Baseline::load(&paths.state);
    let proposals = survey(&paths, &journal, &analysis.effective, &mut baseline)
        .findings
        .len();
    baseline.save(&paths.state);

    let manual = analysis
        .effective
        .iter()
        .filter(|declaration| matches!(declaration.identity.kind, Kind::Permission | Kind::Manual))
        .count();

    let name = crate::facts::Facts::gather(&paths).name;
    let applied = crate::stamp::read_all(&paths)
        .into_iter()
        .find(|(stem, _)| stem == &name)
        .map(|(_, stamp)| out.when(&stamp.applied));

    let mut headline = format!(
        "niwa · {name} · {}",
        count(analysis.effective.len(), "resource")
    );
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
    if manual > 0 {
        out.result(
            Mark::Busy,
            &format!("{} in the checklist", count(manual, "manual step")),
        );
    }
    if pending == 0 && proposals == 0 {
        out.result(Mark::Ok, "in sync · nothing waiting");
    }
    // The keys work where a terminal is attached; piped output is the
    // screen alone.
    if !std::io::stdin().is_terminal() {
        return Ok(ExitCode::SUCCESS);
    }
    out.plain("");
    out.plain("[a]pply  [p]lan  [r]eview  [u]pdate  [h]istory  [q]uit");
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
            },
        ),
        "p" => super::plan::run(out, false, false),
        "r" => super::pull::run(out, false),
        "u" => super::update::run(out, None),
        "h" => super::history::run(out),
        _ => ExitCode::SUCCESS,
    })
}

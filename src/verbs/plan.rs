//! `niwa plan`: what apply would do, and nothing else.
//! Exit codes, in the scripting idiom: 0 in sync, 2 changes pending,
//! 1 error. `niwa plan || niwa apply` is a legitimate thing to write.

use std::process::ExitCode;

use crate::error::Error;
use crate::journal::Journal;
use crate::model::Unit;
use crate::out::{Mark, Out, count};
use crate::paths::Paths;
use crate::plan::{Action, Plan, plan};

pub fn run(out: &Out) -> ExitCode {
    match build() {
        Ok(plan) => render(out, &plan),
        Err(error) => {
            out.error(&error);
            ExitCode::FAILURE
        }
    }
}

fn build() -> Result<Plan, Error> {
    let paths = Paths::resolve()?;
    let analysis = super::load_config(&paths)?;
    let journal = Journal::load(&paths.state)?;
    Ok(plan(analysis.effective, &paths, &journal))
}

fn render(out: &Out, plan: &Plan) -> ExitCode {
    let pending = plan.pending();
    let unchecked = plan.unchecked();
    let checked = plan.items.len() - unchecked;

    if pending == 0 {
        let line = format!("{} · nothing to do", count(plan.items.len(), "resource"));
        out.result(Mark::Ok, &line);
        if unchecked > 0 {
            out.note(&format!(
                "{} not yet checkable in this build",
                count(unchecked, "resource")
            ));
        }
        return ExitCode::SUCCESS;
    }

    render_pending(out, plan);

    let mut summary = format!("{checked} checked · {pending} would change");
    if unchecked > 0 {
        use std::fmt::Write as _;
        let _ = write!(summary, " · {unchecked} not yet checkable");
    }
    out.result(Mark::Changed, &summary);
    ExitCode::from(2)
}

/// The pending half of a plan, grouped by the unit that declared it,
/// in program order. Apply prints the same screen before confirming.
pub fn render_pending(out: &Out, plan: &Plan) {
    let mut current: Option<String> = None;
    let mut rows: Vec<(Mark, String, String)> = Vec::new();
    for item in &plan.items {
        let (mark, detail) = match &item.action {
            Action::Create => (Mark::Added, String::new()),
            Action::Change { detail } => (Mark::Changed, detail.clone()),
            Action::InSync | Action::Unchecked => continue,
        };
        let group = unit_name(&item.declaration.unit);
        if current.as_deref() != Some(group.as_str()) {
            flush(out, &mut rows);
            out.group(&group);
            current = Some(group);
        }
        rows.push((mark, display_name(&item.declaration), detail));
    }
    flush(out, &mut rows);
}

fn flush(out: &Out, rows: &mut Vec<(Mark, String, String)>) {
    if !rows.is_empty() {
        out.list(rows);
        rows.clear();
    }
}

fn unit_name(unit: &Unit) -> String {
    match unit {
        Unit::Init => "init".to_string(),
        Unit::Module(name) | Unit::Host(name) => name.clone(),
    }
}

/// How a resource reads in a plan line: `defaults` keys as
/// `domain key`, files by their path, everything else by identity.
fn display_name(declaration: &crate::model::Declaration) -> String {
    match &declaration.identity.kind {
        crate::model::Kind::Defaults => declaration.identity.key.replacen(':', " ", 1),
        crate::model::Kind::File | crate::model::Kind::Link => declaration.identity.key.clone(),
        _ => declaration.identity.to_string(),
    }
}

//! `niwa plan`: what apply would do, and nothing else.
//! Exit codes, in the scripting idiom: 0 in sync, 2 changes pending,
//! 1 error. `niwa plan || niwa apply` is a legitimate thing to write.

use std::process::ExitCode;
use std::rc::Rc;

use crate::engine::{Engine, Mode};
use crate::error::Error;
use crate::journal::Journal;
use crate::model::{Kind, Unit, Value};
use crate::out::{Mark, Out, count};
use crate::paths::Paths;
use crate::plan::{Action, Plan};

pub fn run(out: &Out, diff: bool, json: bool) -> ExitCode {
    match build() {
        Ok(plan) => {
            if json {
                return render_json(out, &plan);
            }
            let code = render(out, &plan);
            if diff {
                render_diffs(out, &plan);
            }
            code
        }
        Err(error) => {
            out.error(&error);
            ExitCode::FAILURE
        }
    }
}

fn build() -> Result<Plan, Error> {
    let paths = Paths::resolve()?;
    let journal = Journal::load(&paths.state)?;
    let engine = Rc::new(Engine::new(Mode::Plan, paths.clone(), journal));
    super::run_pass(&paths, Some(Rc::clone(&engine)))?;
    Ok(super::plan_of(engine))
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
        // One line by default; `-v` shows the groups, `-vv` every
        // resource, so a converged screen can still be read closely.
        match out.verbosity() {
            0 => {}
            1 => render_groups(out, plan),
            _ => render_all(out, plan),
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

/// `-v` on a converged machine: one count per unit.
fn render_groups(out: &Out, plan: &Plan) {
    let mut units: Vec<(String, usize)> = Vec::new();
    for item in &plan.items {
        let name = unit_name(&item.declaration.unit);
        match units.iter_mut().find(|(unit, _)| unit == &name) {
            Some((_, total)) => *total += 1,
            None => units.push((name, 1)),
        }
    }
    for (unit, total) in units {
        out.result(Mark::Ok, &format!("{unit} · {}", count(total, "resource")));
    }
}

/// `-vv` on a converged machine: every resource, grouped.
fn render_all(out: &Out, plan: &Plan) {
    let mut current: Option<String> = None;
    let mut rows: Vec<(Mark, String, String)> = Vec::new();
    for item in &plan.items {
        let group = unit_name(&item.declaration.unit);
        if current.as_deref() != Some(group.as_str()) {
            flush(out, &mut rows);
            out.group(&group);
            current = Some(group);
        }
        rows.push((Mark::Ok, display_name(&item.declaration), String::new()));
    }
    flush(out, &mut rows);
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

/// The machine interface: one JSON document, versioned like the
/// journal, same exit codes as the human screen.
fn render_json(out: &Out, plan: &Plan) -> ExitCode {
    let items: Vec<serde_json::Value> = plan
        .items
        .iter()
        .map(|item| {
            let (action, detail) = match &item.action {
                Action::InSync => ("in-sync", None),
                Action::Create => ("create", None),
                Action::Change { detail } => ("change", Some(detail.clone())),
                Action::Unchecked => ("unchecked", None),
            };
            serde_json::json!({
                "identity": item.declaration.identity.to_string(),
                "unit": unit_name(&item.declaration.unit),
                "action": action,
                "detail": detail,
            })
        })
        .collect();
    let document = serde_json::json!({
        "version": 1,
        "resources": plan.items.len(),
        "pending": plan.pending(),
        "unchecked": plan.unchecked(),
        "items": items,
    });
    out.raw(&format!("{document}\n"));
    if plan.pending() == 0 {
        ExitCode::SUCCESS
    } else {
        ExitCode::from(2)
    }
}

/// `--diff`: the full content diff for every pending file whose
/// declared bytes are knowable now. Rendered content resolves at
/// apply time — and may hold secrets — so those files stay a name.
fn render_diffs(out: &Out, plan: &Plan) {
    let Ok(paths) = Paths::resolve() else {
        return;
    };
    for item in &plan.items {
        if !matches!(item.action, Action::Create | Action::Change { .. })
            || item.declaration.identity.kind != Kind::File
        {
            continue;
        }
        let Value::Map(fields) = &item.declaration.spec else {
            continue;
        };
        let declared = match (fields.get("source"), fields.get("content")) {
            (Some(Value::Str(source)), _) => source
                .strip_prefix("@self/")
                .and_then(|rest| std::fs::read_to_string(paths.config.join(rest)).ok()),
            (_, Some(Value::Str(content))) => Some(content.clone()),
            _ => None,
        };
        let Some(declared) = declared else {
            continue;
        };
        let target = &item.declaration.identity.key;
        let live = target
            .strip_prefix("~/")
            .map(|rest| paths.home.join(rest))
            .map_or_else(String::new, |path| {
                std::fs::read_to_string(path).unwrap_or_default()
            });
        if live == declared {
            continue;
        }
        out.plain("");
        out.group(target);
        out.diff(&live, &declared);
    }
}

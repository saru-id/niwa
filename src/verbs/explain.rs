//! `niwa explain`: the model, printed for one identity. Every line is
//! one of the three states plus a source location the loader already
//! has; nothing here is new machinery.

use std::process::ExitCode;

use crate::error::Error;
use crate::journal::Journal;
use crate::model::{Declaration, Kind, Value};
use crate::out::{Mark, Out};
use crate::paths::Paths;

pub fn run(out: &Out, target: &str) -> ExitCode {
    match explain(out, target) {
        Ok(code) => code,
        Err(error) => {
            out.error(&error);
            ExitCode::FAILURE
        }
    }
}

fn explain(out: &Out, target: &str) -> Result<ExitCode, Error> {
    let paths = Paths::resolve()?;
    let analysis = super::run_pass(&paths, None)?;
    let journal = Journal::load(&paths.state)?;

    let Some(identity) = find(&analysis.all, target) else {
        out.result(
            Mark::Failed,
            &format!("nothing declared matches `{target}`"),
        );
        let mut close: Vec<String> = analysis
            .all
            .iter()
            .map(|declaration| declaration.identity.to_string())
            .filter(|name| name.contains(target))
            .collect();
        close.sort();
        close.dedup();
        for candidate in close.iter().take(8) {
            out.note(candidate);
        }
        return Ok(ExitCode::FAILURE);
    };

    let layers: Vec<&Declaration> = analysis
        .all
        .iter()
        .filter(|declaration| declaration.identity.to_string() == identity)
        .collect();

    out.plain(&headline(&identity));

    for declaration in &layers {
        let (label, marker) = if declaration.unit.is_host() {
            ("overridden", "    <- wins on this machine")
        } else {
            ("declared", "")
        };
        out.plain(&format!(
            "{label:<13}{:<8}{}{marker}",
            summary(&declaration.spec),
            out.locate(&paths.config, &declaration.provenance.to_string())
        ));
    }

    let actual = actual_of(&paths, &identity, layers.first().copied());
    out.plain(&format!("{:<13}{actual}", "actual"));

    match journal.acknowledged(&identity) {
        Some(ack) => {
            use std::fmt::Write as _;
            let mut trail = String::new();
            if let Some(config) = &ack.config {
                let _ = write!(trail, "apply {config}");
            }
            if let Some(applied) = &ack.applied {
                if !trail.is_empty() {
                    trail.push_str(" · ");
                }
                trail.push_str(&out.when(applied));
            }
            out.plain(&format!(
                "{:<13}{:<8}{trail}",
                "acknowledged",
                summary(&ack.spec)
            ));
        }
        None => out.plain(&format!("{:<13}never applied here", "acknowledged")),
    }

    let history = journal.history_of(&identity);
    if !history.is_empty() {
        let restore = history.last().and_then(|step| match &step.effect {
            crate::journal::Effect::DefaultsSet { previous } => {
                previous.as_ref().map(crate::plan::render_value)
            }
            _ => None,
        });
        let mut line = format!(
            "{:<13}{} change{}",
            "history",
            history.len(),
            if history.len() == 1 { "" } else { "s" }
        );
        if let Some(restore) = restore {
            use std::fmt::Write as _;
            let _ = write!(line, " · undo would restore: {restore}");
        }
        out.plain(&line);
    }

    Ok(ExitCode::SUCCESS)
}

/// Resolve a target the way a person types it: a full identity, a
/// sugar shorthand like `dock.autohide`, or any unique fragment.
fn find(declarations: &[Declaration], target: &str) -> Option<String> {
    let sugar = match target.split_once('.') {
        Some(("dock", key)) => Some(format!("defaults:com.apple.dock:{key}")),
        Some(("finder", key)) => Some(format!("defaults:com.apple.finder:{key}")),
        _ => None,
    };
    let wanted = sugar.unwrap_or_else(|| target.to_string());

    let mut matches: Vec<String> = declarations
        .iter()
        .map(|declaration| declaration.identity.to_string())
        .filter(|name| name == &wanted || name.contains(&wanted))
        .collect();
    matches.sort();
    matches.dedup();
    match matches.as_slice() {
        [only] => Some(only.clone()),
        _ => matches.iter().find(|name| **name == wanted).cloned(),
    }
}

/// The screen's first line: `defaults com.apple.dock autohide`.
fn headline(identity: &str) -> String {
    identity.replace(':', " ")
}

/// One value or a short spec summary, for the state columns.
fn summary(spec: &Value) -> String {
    match spec {
        Value::Map(fields) => fields.get("value").map_or_else(
            || {
                if fields.is_empty() {
                    "present".to_string()
                } else {
                    crate::plan::render_value(spec)
                }
            },
            crate::plan::render_value,
        ),
        other => crate::plan::render_value(other),
    }
}

/// What the machine says right now, for the identity's kind.
fn actual_of(paths: &Paths, identity: &str, declaration: Option<&Declaration>) -> String {
    let Some((kind, key)) = identity.split_once(':') else {
        return "unknown".to_string();
    };
    match kind {
        "defaults" => key.split_once(':').map_or_else(
            || "unknown".to_string(),
            |(domain, preference)| {
                plist::Value::from_file(crate::defaults::domain_path(paths, domain))
                    .ok()
                    .and_then(|root| {
                        root.as_dictionary()
                            .and_then(|dict| dict.get(preference))
                            .map(crate::defaults::plist_to_value)
                    })
                    .map_or_else(
                        || "absent".to_string(),
                        |value| crate::plan::render_value(&value),
                    )
            },
        ),
        "brew.formula" | "brew.cask" => {
            let brew_kind = if kind == "brew.formula" {
                Kind::BrewFormula
            } else {
                Kind::BrewCask
            };
            crate::brew::installed(paths, &brew_kind, key).map_or_else(
                || "absent".to_string(),
                |version| format!("installed ({version})"),
            )
        }
        "file" | "link" => declaration.map_or_else(
            || "unknown".to_string(),
            |declaration| {
                let journal = Journal::default();
                match crate::plan::compare(declaration, paths, &journal) {
                    crate::model::action::Action::InSync => "matches the config".to_string(),
                    crate::model::action::Action::Create => "absent".to_string(),
                    crate::model::action::Action::Change { detail } => detail,
                    crate::model::action::Action::Unchecked => "unknown".to_string(),
                }
            },
        ),
        "npm" => if crate::npm::installed(key) {
            "installed"
        } else {
            "absent"
        }
        .to_string(),
        "mise" => crate::mise::installed(paths, key).map_or_else(
            || "absent".to_string(),
            |version| format!("installed ({version})"),
        ),
        "service" => {
            if crate::services::agent_plist(paths, key).is_file() {
                "loaded plist present".to_string()
            } else {
                "absent".to_string()
            }
        }
        _ => "not checkable".to_string(),
    }
}

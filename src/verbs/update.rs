//! `niwa update [name]`: re-resolve the lockfile, deliberately. A
//! version bump is a decision with a diff, reviewable and committable
//! like any other config change — never a surprise.

use std::process::ExitCode;

use crate::error::Error;
use crate::lockfile::Lockfile;
use crate::model::{Kind, Value};
use crate::out::{Mark, Out, count};
use crate::paths::Paths;

pub fn run(out: &Out, name: Option<&str>) -> ExitCode {
    super::finish(out, update(out, name))
}

fn update(out: &Out, name: Option<&str>) -> Result<ExitCode, Error> {
    let paths = Paths::resolve()?;
    let analysis = super::run_pass(&paths, None)?;
    let mut lock = Lockfile::load(&paths)?;
    let mut rows: Vec<(Mark, String, String)> = Vec::new();
    let wanted = |key: &str| name.is_none_or(|name| key.contains(name));

    for declaration in &analysis.effective {
        match &declaration.identity.kind {
            Kind::GithubRelease if wanted(&declaration.identity.key) => {
                let repo = &declaration.identity.key;
                let pin = crate::release::resolve(repo)?;
                let previous = lock.github_release.insert(repo.clone(), pin.clone());
                match previous {
                    Some(old) if old == pin => {}
                    other => rows.push(move_row(repo, other.map(|old| old.version), &pin.version)),
                }
            }
            Kind::Mise if wanted(&declaration.identity.key) => {
                let tool = &declaration.identity.key;
                let spec = match &declaration.spec {
                    Value::Map(fields) => match fields.get("version") {
                        Some(Value::Str(version)) => Some(version.as_str()),
                        _ => None,
                    },
                    _ => None,
                };
                let Some(version) = crate::mise::latest(tool, spec) else {
                    return Err(Error::Apply {
                        doing: format!("resolving {tool}"),
                        detail: "mise did not answer with a version".to_string(),
                    });
                };
                let pin = crate::lockfile::MisePin { version };
                let previous = lock.mise.insert(tool.clone(), pin.clone());
                match previous {
                    Some(old) if old == pin => {}
                    other => rows.push(move_row(tool, other.map(|old| old.version), &pin.version)),
                }
            }
            Kind::Use if wanted(&declaration.identity.key) => {
                let source = &declaration.identity.key;
                let reference = match &declaration.spec {
                    Value::Map(fields) => match fields.get("ref") {
                        Some(Value::Str(reference)) => reference.clone(),
                        _ => continue,
                    },
                    _ => continue,
                };
                let pin = crate::modules::resolve(&paths, source, &reference)?;
                let previous = lock.uses.insert(source.clone(), pin.clone());
                match previous {
                    Some(old) if old == pin => {}
                    other => rows.push(move_row(source, other.map(|old| old.commit), &pin.commit)),
                }
            }
            _ => {}
        }
    }

    if rows.is_empty() {
        out.result(Mark::Ok, "nothing to update · the lock already agrees");
        return Ok(ExitCode::SUCCESS);
    }
    out.list(&rows);
    lock.save(&paths)?;
    out.result(
        Mark::Ok,
        &format!(
            "{} moved · review with `git diff niwa.lock`, then commit",
            count(rows.len(), "pin")
        ),
    );
    Ok(ExitCode::SUCCESS)
}

/// One aligned row for a pin that moved: what it was, what it is.
fn move_row(name: &str, old: Option<String>, new: &str) -> (Mark, String, String) {
    old.map_or_else(
        || (Mark::Added, name.to_string(), format!("pinned at {new}")),
        |old| (Mark::Changed, name.to_string(), format!("{old} → {new}")),
    )
}

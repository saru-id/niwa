//! `niwa check`: load the config and prove it is well formed. The
//! specs validate as the script runs; afterwards, duplicates fold,
//! conflicts lint with both source locations, every `@self/` source
//! must exist, and the secret gate reads the repo.
//!
//! `--notify` is the watcher's whole vocabulary: the same check, plus
//! a notification when something needs a decision. It never applies.
//! Exit codes: 0 clean, 1 problems.

use std::process::ExitCode;
use std::time::Duration;

use crate::drift::{Baseline, survey};
use crate::error::Error;
use crate::journal::Journal;
use crate::out::{Mark, Out, count};
use crate::paths::Paths;
use crate::util::proc::bounded_output;

pub fn run(out: &Out, notify: bool, upstream: bool) -> ExitCode {
    match check(out, notify, upstream) {
        Ok(code) => code,
        Err(error) => {
            if notify {
                // A config error you just saved is the one interrupt-
                // class event: you find out in seconds, with a line.
                let headline = error
                    .detail()
                    .into_iter()
                    .next()
                    .unwrap_or_else(|| error.to_string());
                post_notification(&format!("config error · {headline}"));
            }
            out.error(&error);
            ExitCode::FAILURE
        }
    }
}

fn check(out: &Out, notify: bool, upstream: bool) -> Result<ExitCode, Error> {
    let paths = Paths::resolve()?;
    let analysis = super::run_pass(&paths, None)?;
    let line = format!(
        "{} · config is valid",
        count(analysis.effective.len(), "resource")
    );
    out.result(Mark::Ok, &line);

    if !analyze(out, &paths) {
        return Ok(ExitCode::FAILURE);
    }

    if upstream && !ask_upstream(out, &paths, &analysis)? {
        return Ok(ExitCode::FAILURE);
    }

    lint_unreferenced(out, &paths, &analysis);
    lint_code_locations(out, &paths, &analysis)?;

    // The watcher pings for exactly three things: a config error you
    // just saved (handled in `run`), drift you just caused (below),
    // and a weekly rot finding worth a decision (below). Everything
    // else waits in the dashboard.
    if notify {
        let journal = Journal::load(&paths.state)?;
        let mut baseline = Baseline::load(&paths.state);
        let result = survey(&paths, &journal, &analysis.effective, &mut baseline);
        // The baseline learns; the journal is read-only here — the
        // watcher never applies, and it never mutates the model.
        baseline.save(&paths.state);
        if !result.findings.is_empty() {
            let first = result.findings[0].label();
            let text = if result.findings.len() == 1 {
                format!("{first} · niwa pull to review")
            } else {
                format!(
                    "{first} · {} more · niwa pull to review",
                    result.findings.len() - 1
                )
            };
            post_notification(&text);
            out.note(&format!(
                "{} waiting · niwa pull to review",
                count(result.findings.len(), "proposal")
            ));
        }

        // The weekly digest: outdated counts wait in the dashboard;
        // only actual breakage pings.
        if crate::upstream::Digest::load(&paths).is_none_or(|digest| digest.is_stale()) {
            let lock = crate::lockfile::Lockfile::load(&paths)?;
            let digest = crate::upstream::refresh(&paths, &analysis.effective, &lock);
            if !digest.missing.is_empty() {
                post_notification(&format!(
                    "gone upstream: {} · niwa check --upstream",
                    count(digest.missing.len(), "declared thing")
                ));
            }
            // Doctor's cheap subset rides the same weekly firing;
            // a broken net is the rot most worth a decision.
            let broken = super::doctor::quiet_problems(&paths);
            if broken > 0 {
                post_notification(&format!(
                    "{} fail · run niwa doctor",
                    count(broken, "doctor check")
                ));
            }
        }
    }
    Ok(ExitCode::SUCCESS)
}

/// `--upstream`: the rot survey, spoken. Ghosts fail the check;
/// what could not be asked is named, never guessed.
fn ask_upstream(
    out: &Out,
    paths: &Paths,
    analysis: &crate::model::analysis::Analysis,
) -> Result<bool, Error> {
    let lock = crate::lockfile::Lockfile::load(paths)?;
    let mut skipped = Vec::new();
    let missing = crate::upstream::survey(&analysis.effective, &lock, &mut skipped);
    for line in &skipped {
        out.note(line);
    }
    if missing.is_empty() {
        out.result(Mark::Ok, "everything you declare still exists upstream");
        return Ok(true);
    }
    for finding in &missing {
        out.result(
            Mark::Failed,
            &format!("{} · {}", finding.identity, finding.detail),
        );
    }
    Ok(false)
}

/// A file landing where code runs from (`LaunchAgents`, a bin
/// directory) deserves one deliberate look. Flagged once per
/// declaration: the acknowledgement is remembered like a declined
/// proposal, so the note never nags.
fn lint_code_locations(
    out: &Out,
    paths: &Paths,
    analysis: &crate::model::analysis::Analysis,
) -> Result<(), Error> {
    // The lock comes before the load: a snapshot taken while an
    // apply still runs would erase its tail on save. When the lock
    // is busy the notes still print; only the memory waits.
    let lock = crate::apply::Lock::take(&paths.state).ok();
    let mut journal = Journal::load(&paths.state)?;
    let mut remembered = false;
    for declaration in &analysis.effective {
        if !matches!(
            declaration.identity.kind,
            crate::model::Kind::File | crate::model::Kind::Link
        ) {
            continue;
        }
        let target = &declaration.identity.key;
        let sensitive = target.contains("Library/LaunchAgents")
            || target.contains("/bin/")
            || target.ends_with("/bin");
        if !sensitive {
            continue;
        }
        let key = format!("lint:code-location:{}", declaration.identity);
        if journal.is_declined(&key) {
            continue;
        }
        out.note(&format!(
            "{} writes where code runs from ({}) · noted once",
            declaration.identity, declaration.provenance
        ));
        journal.decline(key);
        remembered = true;
    }
    if remembered && lock.is_some() {
        journal.save(&paths.state)?;
    }
    Ok(())
}

/// A module no one requires and a source no declaration reads are
/// rot in waiting; the lint names them quietly.
fn lint_unreferenced(out: &Out, paths: &Paths, analysis: &crate::model::analysis::Analysis) {
    if let Ok(entries) = std::fs::read_dir(paths.config.join("modules")) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if std::path::Path::new(&name)
                .extension()
                .is_none_or(|extension| extension != "luau")
            {
                continue;
            }
            if !analysis
                .loaded
                .iter()
                .any(|chunk| chunk == &format!("modules/{name}"))
            {
                out.note(&format!("modules/{name} is never required"));
            }
        }
    }
    let referenced: std::collections::HashSet<&str> = analysis
        .all
        .iter()
        .filter_map(|declaration| match &declaration.spec {
            crate::model::Value::Map(fields) => match (fields.get("source"), fields.get("to")) {
                (Some(crate::model::Value::Str(s)), _) | (_, Some(crate::model::Value::Str(s))) => {
                    s.strip_prefix("@self/")
                }
                _ => None,
            },
            _ => None,
        })
        .collect();
    let mut stack = vec![paths.config.join("files")];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            let Ok(relative) = path.strip_prefix(&paths.config) else {
                continue;
            };
            let relative = relative.to_string_lossy();
            let covered = referenced.iter().any(|source| {
                relative.as_ref() == *source || relative.starts_with(&format!("{source}/"))
            });
            if !covered {
                out.note(&format!("{relative} is referenced by nothing"));
            }
        }
    }
}

/// Deeper type checks through luau-analyze when it is installed;
/// when it is not, one plain sentence says so instead of pretending
/// the checks ran. Returns false when the analyzer found problems.
fn analyze(out: &Out, paths: &Paths) -> bool {
    let mut files: Vec<String> = Vec::new();
    for dir in ["", "modules", "hosts"] {
        let root = paths.config.join(dir);
        let Ok(entries) = std::fs::read_dir(&root) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().is_some_and(|e| e == "luau") {
                files.push(path.display().to_string());
            }
        }
    }
    files.sort();
    let args: Vec<&str> = files.iter().map(String::as_str).collect();
    let Some(finished) = bounded_output("luau-analyze", &args, Duration::from_mins(1)) else {
        out.note("luau-analyze is not installed · deeper type checks were skipped");
        return true;
    };
    if finished.code == Some(0) {
        return true;
    }
    for line in finished.stderr_tail.lines().chain(finished.stdout.lines()) {
        if !line.trim().is_empty() {
            out.plain(line);
        }
    }
    false
}

/// One notification, through the system's own mouth. A missing
/// osascript is a silent no-op: notifying is a courtesy, not a duty.
fn post_notification(text: &str) {
    // Quotes and backslashes both leave: a value ending in a
    // backslash must not escape the AppleScript string it sits in.
    let sanitized = text.replace(['"', '\\'], "'");
    let script = format!("display notification \"{sanitized}\" with title \"niwa\"");
    let _ = bounded_output("osascript", &["-e", &script], Duration::from_secs(10));
}

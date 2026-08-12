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

pub fn run(out: &Out, notify: bool) -> ExitCode {
    match check(out, notify) {
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

fn check(out: &Out, notify: bool) -> Result<ExitCode, Error> {
    let paths = Paths::resolve()?;
    let analysis = super::run_pass(&paths, None)?;
    let line = format!(
        "{} · config is valid",
        count(analysis.effective.len(), "resource")
    );
    out.result(Mark::Ok, &line);

    if !analyze(&paths, out) {
        return Ok(ExitCode::FAILURE);
    }

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
    }
    Ok(ExitCode::SUCCESS)
}

/// Deeper type checks through luau-analyze when it is installed;
/// when it is not, one plain sentence says so instead of pretending
/// the checks ran. Returns false when the analyzer found problems.
fn analyze(paths: &Paths, out: &Out) -> bool {
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
    let sanitized = text.replace('"', "'");
    let script = format!("display notification \"{sanitized}\" with title \"niwa\"");
    let _ = bounded_output("osascript", &["-e", &script], Duration::from_secs(10));
}

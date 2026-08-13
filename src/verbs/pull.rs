//! `niwa pull`: machine → config. The inverse of apply.
//!
//! Plain pull walks each difference with the four answers — apply,
//! edit, never, skip — one decision at a time. `pull --all` stages
//! everything and leaves the review to `git diff`. Either way, pull
//! writes to the working tree and stops there: staging is yours. The
//! secret gate scans everything on its way into the repo, and
//! rendered files are refused by name, because live bytes cannot map
//! back to a template's inputs.

use std::io::IsTerminal as _;
use std::process::ExitCode;

use crate::drift::{Baseline, Finding, survey};
use crate::error::Error;
use crate::journal::Journal;
use crate::model::Kind;
use crate::out::{Mark, Out, count};
use crate::paths::Paths;
use crate::proposals;

pub fn run(out: &Out, all: bool) -> ExitCode {
    super::finish(out, pull(out, all))
}

enum Answer {
    Apply,
    Edit,
    Never,
    Skip,
}

fn pull(out: &Out, all: bool) -> Result<ExitCode, Error> {
    let paths = Paths::resolve()?;
    super::refuse_mid_merge(&paths, "pulling")?;
    let (_lock, reclaimed) = crate::apply::Lock::take(&paths.state)?;
    if reclaimed {
        out.note("reclaimed a stale lock from a crashed run");
    }
    let analysis = super::run_pass(&paths, None)?;
    let mut journal = Journal::load(&paths.state)?;
    let mut baseline = Baseline::load(&paths.state);

    let result = survey(&paths, &journal, &analysis.effective, &mut baseline);
    for identity in &result.stale_acknowledgements {
        journal.drop_acknowledgement(identity);
    }

    if result.findings.is_empty() {
        out.result(Mark::Ok, "nothing to pull · machine and config agree");
        baseline.save(&paths.state);
        journal.save(&paths.state)?;
        return Ok(ExitCode::SUCCESS);
    }

    if !all && !std::io::stdin().is_terminal() {
        return Err(Error::NeedsWalk);
    }

    let mut staged = 0usize;
    let mut held = Vec::new();
    for finding in &result.findings {
        out.result(mark_of(finding), &describe(&analysis.effective, finding));

        // Staging writes to the tree and stops there; removal is a
        // machine mutation and never rides `--all`. An orphan waits
        // for the interactive yes, and returns until it gets one.
        if all && matches!(finding, Finding::Orphan { .. }) {
            out.note("removal waits · run `niwa pull` for the interactive walk");
            continue;
        }
        let answer = if all {
            Answer::Apply
        } else {
            match ask(out) {
                Some(answer) => answer,
                // A closed stdin answers every remaining question the
                // same way: nobody is here to say yes.
                None => break,
            }
        };
        match answer {
            Answer::Apply | Answer::Edit => {
                let edited = matches!(answer, Answer::Edit);
                match accept(
                    &paths,
                    &mut journal,
                    &mut baseline,
                    &analysis.effective,
                    finding,
                    edited,
                ) {
                    Accepted::Staged => staged += 1,
                    Accepted::Held(reason) => held.push(reason),
                }
            }
            Answer::Never => {
                journal.decline(finding.decline_key());
                if let Finding::SettingsFlip { domain, key, live } = finding {
                    baseline.learn(domain, key, live.clone());
                }
            }
            Answer::Skip => {}
        }
    }

    baseline.save(&paths.state);
    journal.save(&paths.state)?;

    if staged > 0 {
        out.result(
            Mark::Ok,
            &format!(
                "{} staged in your config · review with `git diff`",
                count(staged, "change")
            ),
        );
    } else {
        out.result(Mark::Ok, "nothing staged");
    }
    for reason in &held {
        out.note(reason);
    }
    Ok(ExitCode::SUCCESS)
}

enum Accepted {
    Staged,
    Held(String),
}

/// Carry out one accepted finding. What cannot be done safely is held
/// back with its reason, never guessed at.
fn accept(
    paths: &Paths,
    journal: &mut Journal,
    baseline: &mut Baseline,
    declarations: &[crate::model::Declaration],
    finding: &Finding,
    open_editor: bool,
) -> Accepted {
    match finding {
        Finding::LiveEdit { target, source, .. } => {
            let live = std::fs::read(paths.expand_home(target)).unwrap_or_default();
            let hits = crate::gate::scan_bytes(&live);
            if let Some((line, reason)) = hits.first() {
                return Accepted::Held(format!(
                    "{target} held back: line {line} looks like {reason}; the rest of the pull proceeded"
                ));
            }
            match proposals::pull_file(paths, journal, target, source) {
                Ok(()) => Accepted::Staged,
                Err(error) => Accepted::Held(format!("{target}: {error}")),
            }
        }
        Finding::RenderedDrift { target, provenance } => Accepted::Held(format!(
            "{target} is rendered from a template ({provenance}): drift shows as a diff, and the fix is the template, not a pull"
        )),
        Finding::ValueDrift {
            domain,
            key,
            live,
            provenance,
            ..
        } => match proposals::edit_in_place(paths, provenance, key, live) {
            Some(()) => {
                baseline.learn(domain, key, live.clone());
                Accepted::Staged
            }
            None => Accepted::Held(format!(
                "{domain} {key}: the line at {provenance} could not be edited with confidence; edit it by hand"
            )),
        },
        Finding::SettingsFlip { domain, key, live } => {
            let statement = proposals::defaults_statement(domain, key, live);
            let statement = if open_editor {
                match edited_statement(&statement) {
                    Some(edited) => edited,
                    None => return Accepted::Held("the editor left nothing to add".to_string()),
                }
            } else {
                statement
            };
            let home = proposals::place(declarations, &Kind::Defaults, Some(domain));
            match proposals::append(paths, &home, &statement) {
                Ok(()) => {
                    baseline.learn(domain, key, live.clone());
                    Accepted::Staged
                }
                Err(error) => Accepted::Held(error.to_string()),
            }
        }
        Finding::UnmanagedPackage { kind, name } => {
            let statement = proposals::package_statement(kind, name);
            let statement = if open_editor {
                match edited_statement(&statement) {
                    Some(edited) => edited,
                    None => return Accepted::Held("the editor left nothing to add".to_string()),
                }
            } else {
                statement
            };
            let home = proposals::place(declarations, kind, None);
            match proposals::append(paths, &home, &statement) {
                Ok(()) => Accepted::Staged,
                Err(error) => Accepted::Held(error.to_string()),
            }
        }
        Finding::Orphan { identity } => match proposals::remove_orphan(paths, journal, identity) {
            Ok(()) => Accepted::Staged,
            Err(error) => Accepted::Held(format!("{identity}: {error}")),
        },
    }
}

/// `[e]dit`: the proposed lines open in $EDITOR, and what you save is
/// what lands.
fn edited_statement(statement: &str) -> Option<String> {
    let editor = std::env::var("EDITOR").ok()?;
    let dir = std::env::temp_dir();
    let path = dir.join(format!("niwa-proposal-{}.luau", std::process::id()));
    std::fs::write(&path, format!("{statement}\n")).ok()?;
    let path_text = path.display().to_string();
    let status = crate::util::proc::interactive(&editor, &[&path_text]);
    let edited = std::fs::read_to_string(&path).ok();
    let _ = std::fs::remove_file(&path);
    if status != Some(0) {
        return None;
    }
    let edited = edited?.trim_end().to_string();
    if edited.is_empty() {
        None
    } else {
        Some(edited)
    }
}

const fn mark_of(finding: &Finding) -> Mark {
    match finding {
        Finding::LiveEdit { .. } | Finding::ValueDrift { .. } | Finding::RenderedDrift { .. } => {
            Mark::Changed
        }
        Finding::SettingsFlip { .. } | Finding::UnmanagedPackage { .. } => Mark::Added,
        Finding::Orphan { .. } => Mark::Removed,
    }
}

/// One line per finding, in the design's pull shape: what moves, and
/// where it would land.
fn describe(declarations: &[crate::model::Declaration], finding: &Finding) -> String {
    match finding {
        Finding::LiveEdit {
            target,
            source,
            lines_changed,
        } => {
            let rel = source.strip_prefix("@self/").unwrap_or(source);
            format!("{rel} ← {target} ({})", count(*lines_changed, "line"))
        }
        Finding::RenderedDrift { target, .. } => {
            format!("{target} drifted (rendered; the template owns the fix)")
        }
        Finding::ValueDrift {
            domain,
            key,
            live,
            declared,
            provenance,
        } => format!(
            "{} · {domain} {key}   {} → {}",
            provenance.file,
            crate::plan::render_value(declared),
            crate::plan::render_value(live)
        ),
        Finding::SettingsFlip { domain, key, live } => {
            let home = proposals::place(declarations, &Kind::Defaults, Some(domain));
            format!(
                "{} ← {domain} {key} = {}",
                home.display(),
                crate::plan::render_value(live)
            )
        }
        Finding::UnmanagedPackage { kind, name } => {
            let home = proposals::place(declarations, kind, None);
            let provider = match kind {
                Kind::BrewCask => "cask",
                _ => "brew",
            };
            format!("{} ← {provider}: {name}", home.display())
        }
        Finding::Orphan { identity } => {
            format!("{identity} is no longer declared · accepting removes it")
        }
    }
}

/// The four answers, defined once, meaning the same thing everywhere.
/// `None` is a closed stdin: the walk ends, nothing else is asked.
fn ask(out: &Out) -> Option<Answer> {
    Some(
        match out.prompt("[a]pply  [e]dit  [n]ever  [s]kip")?.as_str() {
            "a" => Answer::Apply,
            "e" => Answer::Edit,
            "n" => Answer::Never,
            _ => Answer::Skip,
        },
    )
}

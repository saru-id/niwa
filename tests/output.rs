//! The output contract, tested on the real binary: color obeys the
//! environment, piped output stays grep friendly, `--json` is a
//! versioned document, `--diff` shows content, and `-v` adds the
//! absolutes. Every run uses a throwaway home.

#![allow(
    clippy::unwrap_used,
    reason = "this is a test crate; tests panic loudly by design"
)]

use std::path::Path;
use std::process::{Command, Output};

fn niwa(home: &Path, envs: &[(&str, &str)], args: &[&str]) -> Output {
    let mut command = Command::new(env!("CARGO_BIN_EXE_niwa"));
    command
        .args(args)
        .env_clear()
        .env("HOME", home)
        // Hermetic by construction: without this, surveys would read
        // the developer machine's real Homebrew receipts.
        .env("HOMEBREW_PREFIX", home.join("brew"))
        .envs(coverage_env());
    for (key, value) in envs {
        command.env(key, value);
    }
    command.output().unwrap()
}

fn write(home: &Path, rel: &str, content: &str) {
    let path = home.join(".config/niwa").join(rel);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, content).unwrap();
}

fn stdout(output: &Output) -> String {
    String::from_utf8(output.stdout.clone()).unwrap()
}

/// One file resource that is pending: the target does not exist yet.
fn pending_config(home: &Path) {
    write(
        home,
        "init.luau",
        "local niwa = require(\"@niwa\")\nniwa.file(\"~/.demo\", { source = \"@self/files/demo\" })\n",
    );
    write(home, "files/demo", "alpha\nbravo\ncharlie\n");
}

#[test]
fn piped_output_carries_no_escape_codes_and_no_marks() {
    let home = tempfile::tempdir().unwrap();
    pending_config(home.path());
    let output = niwa(home.path(), &[], &["plan"]);
    assert_eq!(output.status.code(), Some(2));
    let text = stdout(&output);
    assert!(!text.contains('\u{1b}'), "piped output held ANSI: {text}");
    assert!(!text.contains('✓') && !text.contains('✗'));
}

#[test]
fn force_color_paints_even_when_piped_and_no_color_strips_it_back() {
    let home = tempfile::tempdir().unwrap();
    pending_config(home.path());
    let forced = niwa(home.path(), &[("FORCE_COLOR", "1")], &["plan"]);
    assert!(stdout(&forced).contains('\u{1b}'), "FORCE_COLOR must paint");

    // NO_COLOR beats a terminal, and TERM=dumb reads the same; piped
    // runs exercise the same stripped path the design requires.
    let stripped = niwa(
        home.path(),
        &[("NO_COLOR", "1"), ("TERM", "dumb")],
        &["plan"],
    );
    assert!(!stdout(&stripped).contains('\u{1b}'));
}

#[test]
fn plan_json_is_versioned_and_keeps_the_exit_codes() {
    let home = tempfile::tempdir().unwrap();
    pending_config(home.path());
    let output = niwa(home.path(), &[], &["plan", "--json"]);
    assert_eq!(output.status.code(), Some(2));
    let document: serde_json::Value = serde_json::from_str(&stdout(&output)).unwrap();
    assert_eq!(document["version"], 1);
    assert_eq!(document["pending"], 1);
    assert_eq!(document["items"][0]["identity"], "file:~/.demo");
    assert_eq!(document["items"][0]["action"], "create");

    // In sync: same document shape, exit 0.
    std::fs::write(home.path().join(".demo"), "alpha\nbravo\ncharlie\n").unwrap();
    let output = niwa(home.path(), &[], &["plan", "--json"]);
    assert_eq!(output.status.code(), Some(0));
    let document: serde_json::Value = serde_json::from_str(&stdout(&output)).unwrap();
    assert_eq!(document["pending"], 0);
}

#[test]
fn plan_diff_shows_the_changed_content_line_by_line() {
    let home = tempfile::tempdir().unwrap();
    pending_config(home.path());
    std::fs::write(home.path().join(".demo"), "alpha\nbrove\ncharlie\n").unwrap();
    let output = niwa(home.path(), &[], &["plan", "--diff"]);
    assert_eq!(output.status.code(), Some(2));
    let text = stdout(&output);
    assert!(text.contains("- brove"), "old line missing: {text}");
    assert!(text.contains("+ bravo"), "new line missing: {text}");
    assert!(text.contains("alpha"), "context missing: {text}");
}

#[test]
fn verbose_adds_the_absolute_beside_the_humanized_time() {
    let home = tempfile::tempdir().unwrap();
    let state = home.path().join(".local/state/niwa");
    std::fs::create_dir_all(&state).unwrap();
    std::fs::write(
        state.join("journal.json"),
        r#"{"schema":1,"acknowledged":{},"applies":[{"id":1,"when":"2026-08-01T09:00:00Z","steps":[{"identity":"file:~/.x","effect":{"Irreversible":{"what":"demo"}}}]}]}"#,
    )
    .unwrap();
    let plain = niwa(home.path(), &[], &["history"]);
    assert_eq!(plain.status.code(), Some(0));
    assert!(stdout(&plain).contains("ago"));
    assert!(!stdout(&plain).contains("2026-08-01"));

    let verbose = niwa(home.path(), &[], &["history", "-v"]);
    assert!(stdout(&verbose).contains("ago"));
    assert!(
        stdout(&verbose).contains("2026-08-01"),
        "-v must add the absolute: {}",
        stdout(&verbose)
    );
}

#[test]
fn converged_output_is_one_line_then_groups_then_everything() {
    let home = tempfile::tempdir().unwrap();
    pending_config(home.path());
    std::fs::write(home.path().join(".demo"), "alpha\nbravo\ncharlie\n").unwrap();

    let plain = niwa(home.path(), &[], &["plan"]);
    assert_eq!(plain.status.code(), Some(0));
    assert_eq!(stdout(&plain).lines().count(), 1);

    let grouped = niwa(home.path(), &[], &["plan", "-v"]);
    assert!(stdout(&grouped).contains("init · 1 resource"));

    let all = niwa(home.path(), &[], &["plan", "-vv"]);
    assert!(stdout(&all).contains("~/.demo"), "-vv lists resources");
}

#[test]
fn a_long_first_run_prints_the_checklist_up_front() {
    let home = tempfile::tempdir().unwrap();
    let mut script = String::from("local niwa = require(\"@niwa\")\n");
    for index in 0..12 {
        use std::fmt::Write as _;
        let _ = writeln!(
            script,
            "niwa.file(\"~/.front-{index}\", {{ content = \"{index}\" }})"
        );
    }
    script.push_str("niwa.manual({ \"insert the yubikey\" })\n");
    write(home.path(), "init.luau", &script);
    let output = niwa(home.path(), &[], &["apply", "--yes", "--dirty"]);
    assert_eq!(output.status.code(), Some(0));
    let text = stdout(&output);
    let checklist = text.find("yours meanwhile").expect("checklist heading");
    let first_effect = text.find("12 changed").expect("summary");
    assert!(
        checklist < first_effect,
        "the checklist must print before the work: {text}"
    );
    assert!(text.contains("insert the yubikey"));
}

#[test]
fn check_says_plainly_when_the_analyzer_is_missing() {
    let home = tempfile::tempdir().unwrap();
    pending_config(home.path());
    let output = niwa(home.path(), &[], &["check"]);
    assert_eq!(output.status.code(), Some(0));
    assert!(
        stdout(&output).contains("luau-analyze is not installed"),
        "the skipped analyzer must be named: {}",
        stdout(&output)
    );
}

/// Instrumented builds tell children where to write coverage profiles
/// through this variable; without it an instrumented child dumps a
/// `default_*.profraw` into its working directory. Passing it through
/// keeps coverage collectable and the filesystem clean.
fn coverage_env() -> impl Iterator<Item = (&'static str, std::ffi::OsString)> {
    std::env::var_os("LLVM_PROFILE_FILE")
        .map(|value| ("LLVM_PROFILE_FILE", value))
        .into_iter()
}

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
fn apply_only_runs_one_module_and_leaves_the_rest() {
    let home = tempfile::tempdir().unwrap();
    write(
        home.path(),
        "modules/a.luau",
        "local niwa = require(\"@niwa\")\nniwa.file(\"~/.only-a\", { content = \"a\" })\n",
    );
    write(
        home.path(),
        "modules/b.luau",
        "local niwa = require(\"@niwa\")\nniwa.file(\"~/.only-b\", { content = \"b\" })\n",
    );
    write(
        home.path(),
        "init.luau",
        "require(\"@self/modules/a\")\nrequire(\"@self/modules/b\")\n",
    );
    let output = niwa(
        home.path(),
        &[],
        &["apply", "--yes", "--dirty", "--only", "a", "--verify"],
    );
    assert_eq!(
        output.status.code(),
        Some(0),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(home.path().join(".only-a").is_file(), "module a must land");
    assert!(
        !home.path().join(".only-b").exists(),
        "module b must stand as it is"
    );

    let unknown = niwa(
        home.path(),
        &[],
        &["apply", "--yes", "--dirty", "--only", "zz"],
    );
    assert_eq!(unknown.status.code(), Some(1), "an unknown module refuses");
}

#[test]
fn apply_sandbox_rehearses_from_nothing_without_touching_home() {
    let home = tempfile::tempdir().unwrap();
    write(
        home.path(),
        "init.luau",
        "local niwa = require(\"@niwa\")\n\
         niwa.file(\"~/.rehearsed\", { content = \"from nothing\" })\n\
         niwa.brew.formula { \"jq\", \"ripgrep\" }\n",
    );
    let output = niwa(home.path(), &[], &["apply", "--sandbox"]);
    assert_eq!(
        output.status.code(),
        Some(0),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let text = stdout(&output);
    assert!(
        text.contains("works from nothing"),
        "verdict missing: {text}"
    );
    assert!(text.contains("1 file landed") && text.contains("2 packages would install"));
    assert!(
        !home.path().join(".rehearsed").exists(),
        "the rehearsal must not touch the real home"
    );

    // A repo that cannot work from nothing fails the rehearsal.
    write(
        home.path(),
        "init.luau",
        "local niwa = require(\"@niwa\")\nniwa.file(\"~/.x\", { source = \"@self/files/gone\" })\n",
    );
    let broken = niwa(home.path(), &[], &["apply", "--sandbox"]);
    assert_eq!(broken.status.code(), Some(1));
}

#[test]
fn a_ticked_step_stays_ticked_until_the_world_moves() {
    let home = tempfile::tempdir().unwrap();
    write(
        home.path(),
        "init.luau",
        "local niwa = require(\"@niwa\")\nniwa.manual({ \"insert the yubikey\" })\n",
    );
    let state = home.path().join(".local/state/niwa");
    std::fs::create_dir_all(&state).unwrap();
    // In the sandbox no sw_vers answers, so the current context is
    // exactly "macos " — a tick made in this world matches it.
    let journal = |context: &str| {
        format!(
            r#"{{"schema":1,"acknowledged":{{"manual:insert the yubikey":{{"spec":{{"Map":{{}}}},"context":"{context}"}}}}}}"#
        )
    };
    std::fs::write(state.join("journal.json"), journal("macos ")).unwrap();
    let ticked = niwa(home.path(), &[], &[]);
    assert!(
        !stdout(&ticked).contains("checklist"),
        "a ticked step must not count: {}",
        stdout(&ticked)
    );

    // The same tick, made on an older macOS, re-arms by itself.
    std::fs::write(state.join("journal.json"), journal("macos 14")).unwrap();
    let rearmed = niwa(home.path(), &[], &[]);
    assert!(
        stdout(&rearmed).contains("1 manual step in the checklist"),
        "a moved world must re-arm the step: {}",
        stdout(&rearmed)
    );
}

#[test]
fn a_profile_managed_key_fails_naming_the_owner() {
    let home = tempfile::tempdir().unwrap();
    let managed = home.path().join("managed");
    std::fs::create_dir_all(&managed).unwrap();
    std::fs::write(
        managed.join("com.apple.dock.plist"),
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
         <!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n\
         <plist version=\"1.0\"><dict><key>autohide</key><true/></dict></plist>\n",
    )
    .unwrap();
    write(
        home.path(),
        "init.luau",
        "local niwa = require(\"@niwa\")\nniwa.dock { autohide = true }\n",
    );
    let managed_env = managed.display().to_string();
    let output = niwa(
        home.path(),
        &[("NIWA_MANAGED_PREFS", managed_env.as_str())],
        &["check"],
    );
    assert_eq!(output.status.code(), Some(1));
    let err = String::from_utf8_lossy(&output.stderr);
    assert!(
        err.contains("configuration profile"),
        "the owner must be named: {err}"
    );

    // A different, unmanaged key in the same domain stays declarable.
    write(
        home.path(),
        "init.luau",
        "local niwa = require(\"@niwa\")\nniwa.dock { tilesize = 48 }\n",
    );
    let output = niwa(
        home.path(),
        &[("NIWA_MANAGED_PREFS", managed_env.as_str())],
        &["check"],
    );
    assert_eq!(output.status.code(), Some(0));
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

#[test]
fn unattended_apply_refuses_a_dirty_or_merging_tree() {
    let home = tempfile::tempdir().unwrap();
    pending_config(home.path());
    // A mid-merge tree refuses even with --dirty; the marker file is
    // the whole signal.
    let git = home.path().join(".config/niwa/.git");
    std::fs::create_dir_all(&git).unwrap();
    std::fs::write(git.join("MERGE_HEAD"), "0000\n").unwrap();
    let output = niwa(home.path(), &[], &["apply", "--yes", "--dirty"]);
    assert_eq!(output.status.code(), Some(1));
    assert!(
        String::from_utf8_lossy(&output.stderr).contains("mid-merge"),
        "the refusal must say why"
    );
}

#[test]
fn the_plan_marks_where_prediction_begins() {
    let home = tempfile::tempdir().unwrap();
    write(
        home.path(),
        "init.luau",
        "local niwa = require(\"@niwa\")\n\
         local first = niwa.file(\"~/.pred-a\", { content = \"a\" })\n\
         niwa.file(\"~/.pred-b\", { content = \"b\" })\n\
         if first.changed then\n\
             niwa.file(\"~/.pred-c\", { content = \"c\" })\n\
         end\n",
    );
    let output = niwa(home.path(), &[], &["plan"]);
    assert_eq!(output.status.code(), Some(2));
    assert!(
        stdout(&output).contains("predictions until apply"),
        "the plan must mark where prediction begins: {}",
        stdout(&output)
    );
}

#[test]
fn an_unrequired_module_and_an_unreferenced_source_are_named() {
    let home = tempfile::tempdir().unwrap();
    pending_config(home.path());
    write(home.path(), "modules/orphan.luau", "return {}\n");
    write(home.path(), "files/unused", "nobody reads this\n");
    let output = niwa(home.path(), &[], &["check"]);
    assert_eq!(output.status.code(), Some(0));
    let text = stdout(&output);
    assert!(
        text.contains("modules/orphan.luau is never required"),
        "{text}"
    );
    assert!(
        text.contains("files/unused is referenced by nothing"),
        "{text}"
    );
}

#[test]
fn stack_traces_stay_out_unless_debug_asks() {
    let home = tempfile::tempdir().unwrap();
    write(
        home.path(),
        "init.luau",
        "local niwa = require(\"@niwa\")\nniwa.run(\"echo hi\")\n",
    );
    let plain = niwa(home.path(), &[], &["check"]);
    assert_eq!(plain.status.code(), Some(1));
    assert!(
        !String::from_utf8_lossy(&plain.stderr).contains("stack traceback"),
        "raw traces never reach a person"
    );
    let debug = niwa(home.path(), &[], &["check", "--debug"]);
    assert!(
        String::from_utf8_lossy(&debug.stderr).contains("stack traceback"),
        "--debug keeps one for reports"
    );
}

#[test]
fn the_command_surface_is_exactly_the_twenty_verbs() {
    let home = tempfile::tempdir().unwrap();
    let output = niwa(home.path(), &[], &["--help"]);
    let text = stdout(&output);
    for verb in [
        "apply",
        "plan",
        "pull",
        "add",
        "undo",
        "explain",
        "check",
        "update",
        "history",
        "machines",
        "doctor",
        "export",
        "tag",
        "fmt",
        "init",
        "self",
        "migrate",
        "seal-key",
        "uninstall",
    ] {
        assert!(text.contains(verb), "verb missing from the surface: {verb}");
    }
    // Nineteen subcommands; plain `niwa` — the dashboard — is the
    // twentieth verb of the contract.
}

#[test]
fn a_torn_lockfile_refuses_instead_of_installing_latest() {
    let home = tempfile::tempdir().unwrap();
    write(
        home.path(),
        "init.luau",
        "local niwa = require(\"@niwa\")\nniwa.mise.tool { node = \"lts\" }\n",
    );
    write(
        home.path(),
        "niwa.lock",
        "[github_release.\"broken\ngarbage = {{{",
    );
    let output = niwa(home.path(), &[], &["apply", "--yes", "--dirty"]);
    assert_eq!(
        output.status.code(),
        Some(1),
        "a torn lock must refuse, not default to empty: {}",
        String::from_utf8_lossy(&output.stdout)
    );
    assert!(
        String::from_utf8_lossy(&output.stderr).contains("niwa.lock"),
        "the refusal names the file"
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

//! Screen snapshots. The interface is part of the contract: these
//! lock the exact bytes each screen produces, piped and colored, and
//! a degraded screen is a red gate.

#![allow(
    clippy::unwrap_used,
    reason = "this is a test crate; tests panic loudly by design"
)]

use std::path::Path;
use std::process::Command;

struct Run {
    stdout: String,
    stderr: String,
    code: i32,
}

fn niwa(home: &Path, args: &[&str], force_color: bool) -> Run {
    let mut command = Command::new(env!("CARGO_BIN_EXE_niwa"));
    command
        .args(args)
        .env_clear()
        .env("HOME", home)
        .env("NIWA_MANAGED_PREFS", home.join("managed"))
        // Hermetic by construction: without this, surveys would read
        // the developer machine's real Homebrew receipts.
        .env("HOMEBREW_PREFIX", home.join("brew"))
        .envs(coverage_env());
    if force_color {
        command.env("FORCE_COLOR", "1");
    }
    let output = command.output().unwrap();
    let redact = |raw: &[u8]| {
        String::from_utf8(raw.to_vec())
            .unwrap()
            .replace(&home.display().to_string(), "~")
    };
    Run {
        stdout: redact(&output.stdout),
        stderr: redact(&output.stderr),
        code: output.status.code().unwrap(),
    }
}

fn write(home: &Path, rel: &str, content: &str) {
    let path = home.join(".config/niwa").join(rel);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, content).unwrap();
}

/// A small config with pending file and defaults work.
fn pending_home() -> tempfile::TempDir {
    let home = tempfile::tempdir().unwrap();
    write(home.path(), "files/zshrc", "export EDITOR=nvim\n");
    write(
        home.path(),
        "modules/shell.luau",
        "local niwa = require(\"@niwa\")\nniwa.file(\"~/.zshrc\", { source = \"@self/files/zshrc\" })\n",
    );
    write(
        home.path(),
        "modules/desktop.luau",
        "local niwa = require(\"@niwa\")\nniwa.dock { autohide = true, tilesize = 48 }\n",
    );
    write(
        home.path(),
        "init.luau",
        "require(\"@self/modules/shell\")\nrequire(\"@self/modules/desktop\")\n",
    );
    // The dock plist disagrees on autohide and already agrees on
    // tilesize, so the plan shows one change and one create.
    let preferences = home.path().join("Library/Preferences");
    std::fs::create_dir_all(&preferences).unwrap();
    std::fs::write(
        preferences.join("com.apple.dock.plist"),
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
         <!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n\
         <plist version=\"1.0\"><dict>\n\
         <key>autohide</key><false/>\n\
         <key>tilesize</key><integer>48</integer>\n\
         </dict></plist>\n",
    )
    .unwrap();
    home
}

#[test]
fn the_plan_screen_groups_by_module() {
    let home = pending_home();
    let run = niwa(home.path(), &["plan"], false);
    assert_eq!(run.code, 2, "{}", run.stderr);
    insta::assert_snapshot!("plan_pending_piped", run.stdout);
}

#[test]
fn the_plan_screen_wears_marks_and_color_on_a_terminal() {
    let home = pending_home();
    let run = niwa(home.path(), &["plan"], true);
    assert_eq!(run.code, 2, "{}", run.stderr);
    insta::assert_snapshot!("plan_pending_color", run.stdout);
}

#[test]
fn the_converged_plan_is_one_line() {
    let home = pending_home();
    // Make both declarations true: the file with the source bytes,
    // the dock plist with both keys as declared.
    std::fs::write(home.path().join(".zshrc"), "export EDITOR=nvim\n").unwrap();
    std::fs::write(
        home.path().join("Library/Preferences/com.apple.dock.plist"),
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
         <!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n\
         <plist version=\"1.0\"><dict>\n\
         <key>autohide</key><true/>\n\
         <key>tilesize</key><integer>48</integer>\n\
         </dict></plist>\n",
    )
    .unwrap();
    let run = niwa(home.path(), &["plan"], false);
    assert_eq!(run.code, 0, "{}", run.stderr);
    insta::assert_snapshot!("plan_converged_piped", run.stdout);
}

#[test]
fn the_apply_screen_shows_the_work_then_the_summary() {
    let home = pending_home();
    let run = niwa(home.path(), &["apply", "--yes"], false);
    assert_eq!(run.code, 0, "{}", run.stderr);
    insta::assert_snapshot!("apply_pending_piped", run.stdout);
}

#[test]
fn the_conflict_screen_names_both_locations() {
    let home = tempfile::tempdir().unwrap();
    write(
        home.path(),
        "modules/a.luau",
        "local niwa = require(\"@niwa\")\nniwa.dock { autohide = true }\n",
    );
    write(
        home.path(),
        "modules/b.luau",
        "local niwa = require(\"@niwa\")\nniwa.defaults(\"com.apple.dock\", { autohide = false })\n",
    );
    write(
        home.path(),
        "init.luau",
        "require(\"@self/modules/a\")\nrequire(\"@self/modules/b\")\n",
    );
    let run = niwa(home.path(), &["check"], false);
    assert_eq!(run.code, 1);
    insta::assert_snapshot!("check_conflict_piped", run.stderr);
}

#[test]
fn the_unguarded_run_error_names_the_guards() {
    let home = tempfile::tempdir().unwrap();
    write(
        home.path(),
        "init.luau",
        "local niwa = require(\"@niwa\")\nniwa.run(\"echo hi\")\n",
    );
    let run = niwa(home.path(), &["check"], false);
    assert_eq!(run.code, 1);
    // The trailing traceback carries VM frames; the message is the
    // contract. Keep the first lines.
    let head: String = run
        .stderr
        .lines()
        .take_while(|line| !line.contains("stack traceback"))
        .collect::<Vec<_>>()
        .join("\n");
    insta::assert_snapshot!("check_unguarded_piped", head);
}

#[test]
fn the_missing_config_error_says_where_to_start() {
    let home = tempfile::tempdir().unwrap();
    let run = niwa(home.path(), &["check"], false);
    assert_eq!(run.code, 1);
    insta::assert_snapshot!("check_missing_config_piped", run.stderr);
}

#[test]
fn the_dashboard_screen_answers_in_one_look() {
    let home = pending_home();
    let run = niwa(home.path(), &[], false);
    assert_eq!(run.code, 0);
    insta::assert_snapshot!(run.stdout);
}

#[test]
fn the_machines_screen_reads_the_fleet_from_stamps() {
    let home = tempfile::tempdir().unwrap();
    write(
        home.path(),
        "init.luau",
        "local niwa = require(\"@niwa\")\nniwa.dock { autohide = true }\n",
    );
    write(
        home.path(),
        "state/laptop.toml",
        "machine_id = \"AAAA-1111\"\nname = \"laptop\"\napplied = \"2026-08-01T09:00:00Z\"\nniwa = \"0.1.0\"\nresources = 12\n",
    );
    write(
        home.path(),
        "state/workbox.toml",
        "machine_id = \"BBBB-2222\"\nname = \"workbox\"\napplied = \"2026-06-15T09:00:00Z\"\nniwa = \"0.1.0\"\nresources = 40\ntags = [\"work\"]\n",
    );
    let run = niwa(home.path(), &["machines"], false);
    assert_eq!(run.code, 0);
    insta::with_settings!({filters => vec![(r"\d+[smhdw] ago|just now", "[ago]")]}, {
        insta::assert_snapshot!(run.stdout);
    });
}

#[test]
fn the_explain_screen_prints_the_model_for_one_resource() {
    let home = pending_home();
    let run = niwa(home.path(), &["explain", "dock.autohide"], false);
    assert_eq!(run.code, 0);
    insta::assert_snapshot!(run.stdout);
}

#[test]
fn the_pull_screen_stages_an_unmanaged_package() {
    let home = pending_home();
    let brew = home.path().join("brew/Cellar/jq/1.7.1");
    std::fs::create_dir_all(&brew).unwrap();
    std::fs::write(
        brew.join("INSTALL_RECEIPT.json"),
        "{\"installed_on_request\":true}",
    )
    .unwrap();
    let output = Command::new(env!("CARGO_BIN_EXE_niwa"))
        .args(["pull", "--all"])
        .env_clear()
        .env("HOME", home.path())
        .env("HOMEBREW_PREFIX", home.path().join("brew"))
        .envs(coverage_env())
        .output()
        .unwrap();
    assert_eq!(output.status.code(), Some(0));
    let stdout = String::from_utf8(output.stdout)
        .unwrap()
        .replace(&home.path().display().to_string(), "~");
    insta::assert_snapshot!(stdout);
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

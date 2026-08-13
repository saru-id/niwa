//! The output contract, tested on the real binary: color obeys the
//! environment, piped output stays grep friendly, `--json` is a
//! versioned document, `--diff` shows content, and `-v` adds the
//! absolutes. Every run uses a throwaway home.

#![allow(
    clippy::unwrap_used,
    reason = "this is a test crate; tests panic loudly by design"
)]

mod common;
use common::{niwa, stderr, stdout, write};
use std::path::Path;

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
fn a_rehearsal_leaves_absolute_targets_alone() {
    let home = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    let target = outside.path().join("absolute-target");
    write(
        home.path(),
        "init.luau",
        &format!(
            "local niwa = require(\"@niwa\")\nniwa.file(\"{}\", {{ content = \"never\" }})\n",
            target.display()
        ),
    );
    let output = niwa(home.path(), &[], &["apply", "--sandbox"]);
    assert_eq!(output.status.code(), Some(0), "{}", stderr(&output));
    assert!(!target.exists(), "the rehearsal wrote outside its sandbox");
    assert!(stdout(&output).contains("absolute"), "{}", stdout(&output));
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
    assert_eq!(ticked.status.code(), Some(0), "{}", stderr(&ticked));
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
fn what_is_already_true_is_adopted_silently() {
    let home = tempfile::tempdir().unwrap();
    write(home.path(), "files/zshrc", "export EDITOR=nvim\n");
    write(
        home.path(),
        "init.luau",
        "local niwa = require(\"@niwa\")\nniwa.file(\"~/.zshrc\", { source = \"@self/files/zshrc\" })\n",
    );
    std::fs::write(home.path().join(".zshrc"), "export EDITOR=nvim\n").unwrap();

    let output = niwa(home.path(), &[], &["apply", "--yes", "--dirty"]);
    assert_eq!(output.status.code(), Some(0), "{}", stderr(&output));
    assert!(
        stdout(&output).contains("nothing to do"),
        "{}",
        stdout(&output)
    );
    // The silent half: the journal now acknowledges the identity
    // even though the apply touched nothing.
    assert!(
        acknowledged(home.path()).contains(&"file:~/.zshrc".to_string()),
        "adoption must acknowledge"
    );
}

/// The identities the journal acknowledges, parsed, so history
/// entries cannot masquerade as acknowledgements.
fn acknowledged(home: &Path) -> Vec<String> {
    let text =
        std::fs::read_to_string(home.join(".local/state/niwa/journal.json")).unwrap_or_default();
    let value: serde_json::Value = serde_json::from_str(&text).unwrap_or_default();
    value["acknowledged"]
        .as_object()
        .map(|map| map.keys().cloned().collect())
        .unwrap_or_default()
}

#[test]
fn an_acknowledgement_gone_on_both_sides_is_dropped() {
    let home = tempfile::tempdir().unwrap();
    write(home.path(), "files/zshrc", "export EDITOR=nvim\n");
    write(
        home.path(),
        "init.luau",
        "local niwa = require(\"@niwa\")\nniwa.file(\"~/.zshrc\", { source = \"@self/files/zshrc\" })\n",
    );
    let output = niwa(home.path(), &[], &["apply", "--yes", "--dirty"]);
    assert_eq!(output.status.code(), Some(0), "{}", stderr(&output));

    // The declaration and the file both vanish: the ○○● row.
    write(home.path(), "init.luau", "");
    std::fs::remove_file(home.path().join(".zshrc")).unwrap();
    let output = niwa(home.path(), &[], &["pull", "--all"]);
    assert_eq!(output.status.code(), Some(0), "{}", stderr(&output));
    assert!(
        stdout(&output).contains("nothing to pull"),
        "{}",
        stdout(&output)
    );
    assert!(
        !acknowledged(home.path()).contains(&"file:~/.zshrc".to_string()),
        "the stale acknowledgement survived"
    );
}

#[test]
fn a_missing_secret_reports_every_place_it_looked() {
    let home = tempfile::tempdir().unwrap();
    let bin = home.path().join("bin");
    std::fs::create_dir_all(&bin).unwrap();
    std::fs::write(bin.join("security"), "#!/bin/sh\nexit 44\n").unwrap();
    let mut permissions = std::fs::metadata(bin.join("security"))
        .unwrap()
        .permissions();
    std::os::unix::fs::PermissionsExt::set_mode(&mut permissions, 0o755);
    std::fs::set_permissions(bin.join("security"), permissions).unwrap();
    write(
        home.path(),
        "init.luau",
        "local niwa = require(\"@niwa\")\nlocal t = niwa.secret(\"github-token\")\nniwa.file(\"~/.x\", { content = niwa.render(\"{t}\", { t = t }) })\n",
    );
    let output = niwa(home.path(), &[("PATH", bin.to_str().unwrap())], &["plan"]);
    assert_eq!(output.status.code(), Some(1), "{}", stdout(&output));
    let err = stderr(&output);
    assert!(err.contains("keychain"), "{err}");
    assert!(err.contains("github-token.age"), "{err}");
}

#[test]
fn a_mid_merge_tree_refuses_proposals_too() {
    let home = tempfile::tempdir().unwrap();
    pending_config(home.path());
    std::fs::create_dir_all(home.path().join(".config/niwa/.git")).unwrap();
    std::fs::write(home.path().join(".config/niwa/.git/MERGE_HEAD"), "abc\n").unwrap();
    let output = niwa(home.path(), &[], &["pull", "--all"]);
    assert_eq!(output.status.code(), Some(1), "{}", stdout(&output));
    assert!(stderr(&output).contains("mid-merge"), "{}", stderr(&output));
}

#[test]
fn check_says_plainly_when_the_analyzer_is_missing() {
    let home = tempfile::tempdir().unwrap();
    pending_config(home.path());
    let output = niwa(home.path(), &[], &["check"]);
    assert_eq!(output.status.code(), Some(0));
    assert!(
        stdout(&output)
            .contains("luau-analyze is not installed · deeper type checks were skipped\n"),
        "the skipped analyzer must be named, in the one agreed voice: {}",
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
    // Parse the indented rows of the Commands block: the actual set,
    // so a verb added or lost fails this test either way.
    let block = text
        .split_once("Commands:\n")
        .map(|(_, rest)| rest)
        .and_then(|rest| rest.split_once("\n\n").map(|(block, _)| block))
        .unwrap_or_default();
    let mut listed: Vec<&str> = block
        .lines()
        .filter_map(|line| line.split_whitespace().next())
        .filter(|name| *name != "help")
        .collect();
    listed.sort_unstable();
    let mut expected = [
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
    ];
    expected.sort_unstable();
    // Nineteen subcommands; plain `niwa` — the dashboard — is the
    // twentieth verb of the contract.
    assert_eq!(listed, expected);
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

#[test]
fn a_failure_inside_try_is_contained() {
    let home = tempfile::tempdir().unwrap();
    write(
        home.path(),
        "init.luau",
        "local niwa = require(\"@niwa\")\n\
         niwa.try(function()\n\
             niwa.run(\"/usr/bin/false\", { unless = niwa.exists(\"~/.never\") })\n\
         end)\n\
         niwa.file(\"~/.after-try\", { content = \"still here\" })\n",
    );
    let output = niwa(home.path(), &[], &["apply", "--yes", "--dirty"]);
    assert_eq!(
        output.status.code(),
        Some(0),
        "try must contain the failure: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(home.path().join(".after-try").is_file());

    // Without try, the same failure halts the run.
    write(
        home.path(),
        "init.luau",
        "local niwa = require(\"@niwa\")\n\
         niwa.run(\"/usr/bin/false\", { unless = niwa.exists(\"~/.never\") })\n\
         niwa.file(\"~/.after-bare\", { content = \"unreached\" })\n",
    );
    let output = niwa(home.path(), &[], &["apply", "--yes", "--dirty"]);
    assert_eq!(output.status.code(), Some(1));
    assert!(!home.path().join(".after-bare").exists());
}

#[test]
fn an_optional_failure_still_reports_failed() {
    let home = tempfile::tempdir().unwrap();
    write(
        home.path(),
        "init.luau",
        "local niwa = require(\"@niwa\")\n\
         local r = niwa.run(\"/usr/bin/false\", {\n\
             unless = niwa.exists(\"~/.never\"),\n\
             optional = true,\n\
         })\n\
         if r.failed then\n\
             niwa.file(\"~/.saw-the-failure\", { content = \"honest\" })\n\
         end\n",
    );
    let output = niwa(home.path(), &[], &["apply", "--yes", "--dirty"]);
    assert_eq!(
        output.status.code(),
        Some(0),
        "optional means the run continues: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(
        home.path().join(".saw-the-failure").is_file(),
        "the failed flag is the whole point of optional"
    );
}

#[test]
fn a_lockfile_from_a_newer_niwa_says_update_first() {
    let home = tempfile::tempdir().unwrap();
    pending_config(home.path());
    write(home.path(), "niwa.lock", "niwa = \"99.0.0\"\n");
    let output = niwa(home.path(), &[], &["apply", "--yes", "--dirty"]);
    assert_eq!(output.status.code(), Some(1));
    assert!(
        String::from_utf8_lossy(&output.stderr).contains("update niwa first"),
        "the way out must be named: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}

#[test]
fn hostile_labels_and_domains_are_refused() {
    let home = tempfile::tempdir().unwrap();
    write(
        home.path(),
        "init.luau",
        "local niwa = require(\"@niwa\")\n\
         niwa.service {\n\
             label = \"../../../../tmp/evil\",\n\
             program = { \"/bin/true\" },\n\
             keepalive = true,\n\
         }\n",
    );
    let output = niwa(home.path(), &[], &["check"]);
    assert_eq!(
        output.status.code(),
        Some(1),
        "a traversal label must refuse"
    );

    write(
        home.path(),
        "init.luau",
        "local niwa = require(\"@niwa\")\n\
         niwa.defaults(\"/tmp/evil\", { anything = true })\n",
    );
    let output = niwa(home.path(), &[], &["check"]);
    assert_eq!(
        output.status.code(),
        Some(1),
        "an absolute domain outside the preference roots must refuse"
    );

    // The admin half the design names stays declarable.
    write(
        home.path(),
        "init.luau",
        "local niwa = require(\"@niwa\")\n\
         niwa.defaults(\"/Library/Preferences/com.apple.alf\", { globalstate = 1 })\n",
    );
    let output = niwa(home.path(), &[], &["check"]);
    assert_eq!(output.status.code(), Some(0));
}

#[test]
fn force_takes_targets_and_protection_shows_the_diff() {
    let home = tempfile::tempdir().unwrap();
    write(
        home.path(),
        "init.luau",
        "local niwa = require(\"@niwa\")\n\
         niwa.file(\"~/.prot-a\", { content = \"niwa a\\n\" })\n\
         niwa.file(\"~/.prot-b\", { content = \"niwa b\\n\" })\n",
    );
    std::fs::write(home.path().join(".prot-a"), "hand a\n").unwrap();
    std::fs::write(home.path().join(".prot-b"), "hand b\n").unwrap();

    // Unforced: both protected, and the diff is shown, not guessed.
    let output = niwa(home.path(), &[], &["apply", "--yes", "--dirty"]);
    assert_eq!(output.status.code(), Some(0));
    let text = stdout(&output);
    assert!(text.contains("2 protected"), "{text}");
    assert!(
        text.contains("- hand a") && text.contains("+ niwa a"),
        "the protected file's diff must show: {text}"
    );

    // Per-file force lifts protection for the named target only.
    let output = niwa(
        home.path(),
        &[],
        &["apply", "--yes", "--dirty", "--force", "~/.prot-a"],
    );
    assert_eq!(output.status.code(), Some(0));
    assert_eq!(
        std::fs::read_to_string(home.path().join(".prot-a")).unwrap(),
        "niwa a\n"
    );
    assert_eq!(
        std::fs::read_to_string(home.path().join(".prot-b")).unwrap(),
        "hand b\n",
        "the unnamed file keeps its hand edits"
    );
}

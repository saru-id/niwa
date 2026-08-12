//! The API surface as `niwa check` sees it: identities, spec
//! validation, folding, conflicts, and the host hook. Everything runs
//! the real binary in a throwaway home.

#![allow(
    clippy::unwrap_used,
    reason = "this is a test crate; tests panic loudly by design"
)]

use std::path::Path;
use std::process::{Command, Output};

fn niwa(home: &Path, args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_niwa"))
        .args(args)
        .env_clear()
        .env("HOME", home)
        .envs(coverage_env())
        .output()
        .unwrap()
}

fn write(home: &Path, rel: &str, content: &str) {
    let path = home.join(".config/niwa").join(rel);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, content).unwrap();
}

fn stdout(output: &Output) -> String {
    String::from_utf8(output.stdout.clone()).unwrap()
}

fn stderr(output: &Output) -> String {
    String::from_utf8(output.stderr.clone()).unwrap()
}

fn checks_clean(home: &Path) -> String {
    let output = niwa(home, &["check"]);
    assert_eq!(output.status.code(), Some(0), "{}", stderr(&output));
    stdout(&output)
}

fn check_fails(home: &Path) -> String {
    let output = niwa(home, &["check"]);
    assert_eq!(output.status.code(), Some(1), "{}", stdout(&output));
    stderr(&output)
}

const PRELUDE: &str = "local niwa = require(\"@niwa\")\n";

fn config(body: &str) -> String {
    format!("{PRELUDE}{body}")
}

#[test]
fn the_whole_surface_declares_and_counts_distinct_identities() {
    let home = tempfile::tempdir().unwrap();
    write(home.path(), "files/zshrc", "export EDITOR=nvim\n");
    std::fs::create_dir_all(home.path().join(".config/niwa/files/nvim")).unwrap();
    write(
        home.path(),
        "init.luau",
        &config(
            r#"niwa.brew.formula { "fd", "ripgrep" }
niwa.brew.formula "fd" -- same identity, same spec: folds
niwa.brew.cask { "ghostty" }
niwa.brew.service "redis" -- the service implies the formula
niwa.mas.app { ["Things 3"] = 904280696 }
niwa.npm.global "@biomejs/biome"
niwa.mise.tool { node = "lts" }
niwa.github_release { repo = "jesseduffield/lazygit", bin = "lazygit" }
niwa.file("~/.zshrc", { source = "@self/files/zshrc" })
niwa.link("~/.config/nvim", { to = "@self/files/nvim" })
niwa.defaults("com.apple.dock", { autohide = true })
niwa.dock { tilesize = 48 }
niwa.finder { show_hidden = true }
niwa.hosts { ["dev.test"] = "127.0.0.1" }
niwa.login_shell "/bin/zsh"
niwa.hostname "box"
niwa.service { label = "dev.box.sync", program = { "/bin/true" }, interval = "15m" }
niwa.run("echo hi", { unless = false })
niwa.once("setup", function()
  niwa.run("echo once")
end)
niwa.permission { app = "Ghostty", needs = "accessibility" }
niwa.manual { "Sign in somewhere", open = "https://example.com" }
niwa.use("github:owner/repo@v1")
local tool = niwa.resource("my.tool", {
  check = function() return true end,
  apply = function() end,
  reverse = false,
  describe = function(spec) return spec.name end,
})
tool { name = "widget" }
"#,
        ),
    );
    let output = checks_clean(home.path());
    assert_eq!(output, "25 resources · config is valid\n");
}

#[test]
fn a_directory_source_fans_out_per_file() {
    let home = tempfile::tempdir().unwrap();
    write(home.path(), "files/bin/one", "#!/bin/sh\n");
    write(home.path(), "files/bin/two", "#!/bin/sh\n");
    write(
        home.path(),
        "init.luau",
        &config("niwa.file(\"~/.local/bin/\", { source = \"@self/files/bin/\" })\n"),
    );
    assert_eq!(checks_clean(home.path()), "2 resources · config is valid\n");
}

#[test]
fn two_modules_disagreeing_is_a_conflict_with_both_locations() {
    let home = tempfile::tempdir().unwrap();
    write(
        home.path(),
        "modules/a.luau",
        &config("niwa.dock { autohide = true }\n"),
    );
    write(
        home.path(),
        "modules/b.luau",
        &config("niwa.defaults(\"com.apple.dock\", { autohide = false })\n"),
    );
    write(
        home.path(),
        "init.luau",
        "require(\"@self/modules/a\")\nrequire(\"@self/modules/b\")\n",
    );
    let err = check_fails(home.path());
    assert!(err.contains("conflict"), "{err}");
    assert!(err.contains("defaults:com.apple.dock:autohide"), "{err}");
    assert!(err.contains("modules/a.luau:2"), "{err}");
    assert!(err.contains("modules/b.luau:2"), "{err}");
}

#[test]
fn a_host_file_overriding_a_module_is_allowed() {
    let home = tempfile::tempdir().unwrap();
    let bin = home.path().join("bin");
    std::fs::create_dir_all(&bin).unwrap();
    std::fs::write(bin.join("scutil"), "#!/bin/sh\necho testbox\n").unwrap();
    let mut permissions = std::fs::metadata(bin.join("scutil")).unwrap().permissions();
    std::os::unix::fs::PermissionsExt::set_mode(&mut permissions, 0o755);
    std::fs::set_permissions(bin.join("scutil"), permissions).unwrap();

    write(
        home.path(),
        "modules/desktop.luau",
        &config("niwa.dock { autohide = true }\n"),
    );
    write(
        home.path(),
        "hosts/testbox.luau",
        &config("niwa.dock { autohide = false }\n"),
    );
    write(
        home.path(),
        "init.luau",
        "local niwa = require(\"@niwa\")\nrequire(\"@self/modules/desktop\")\nniwa.host()\n",
    );

    let output = Command::new(env!("CARGO_BIN_EXE_niwa"))
        .arg("check")
        .env_clear()
        .env("HOME", home.path())
        .envs(coverage_env())
        .env("PATH", &bin)
        .output()
        .unwrap();
    assert_eq!(output.status.code(), Some(0), "{}", stderr(&output));
    assert_eq!(stdout(&output), "1 resource · config is valid\n");
}

#[test]
fn an_unguarded_run_is_rejected_with_the_three_guards() {
    let home = tempfile::tempdir().unwrap();
    write(home.path(), "init.luau", &config("niwa.run(\"echo hi\")\n"));
    let err = check_fails(home.path());
    assert!(err.contains("init.luau:2"), "{err}");
    assert!(err.contains("unless"), "{err}");
    assert!(err.contains("only_if"), "{err}");
    assert!(err.contains("creates"), "{err}");
}

#[test]
fn spec_errors_name_the_resource_the_field_and_the_place() {
    let home = tempfile::tempdir().unwrap();
    write(
        home.path(),
        "init.luau",
        &config("niwa.dock { tilesize = \"large\" }\n"),
    );
    let err = check_fails(home.path());
    assert!(err.contains("init.luau:2"), "{err}");
    assert!(err.contains("niwa.dock"), "{err}");
    assert!(err.contains("tilesize"), "{err}");
    assert!(err.contains("integer"), "{err}");
    assert!(err.contains("string"), "{err}");
}

#[test]
fn unknown_fields_are_rejected_with_the_known_ones() {
    let home = tempfile::tempdir().unwrap();
    write(
        home.path(),
        "init.luau",
        &config("niwa.dock { magnify = true }\n"),
    );
    let err = check_fails(home.path());
    assert!(err.contains("unknown field `magnify`"), "{err}");
    assert!(err.contains("autohide"), "{err}");
}

#[test]
fn enums_reject_the_fifth_value() {
    let home = tempfile::tempdir().unwrap();
    write(
        home.path(),
        "init.luau",
        &config("niwa.dock { minimize_effect = \"warp\" }\n"),
    );
    let err = check_fails(home.path());
    assert!(err.contains("genie"), "{err}");
    assert!(err.contains("warp"), "{err}");
}

#[test]
fn a_file_needs_exactly_one_of_source_and_content() {
    let home = tempfile::tempdir().unwrap();
    write(
        home.path(),
        "init.luau",
        &config("niwa.file(\"~/.zshrc\", {})\n"),
    );
    let err = check_fails(home.path());
    assert!(err.contains("source"), "{err}");
    assert!(err.contains("content"), "{err}");
}

#[test]
fn a_missing_file_source_fails_the_check() {
    let home = tempfile::tempdir().unwrap();
    write(
        home.path(),
        "init.luau",
        &config("niwa.file(\"~/.zshrc\", { source = \"@self/files/zshrc\" })\n"),
    );
    let err = check_fails(home.path());
    assert!(err.contains("files that do not exist"), "{err}");
    assert!(err.contains("@self/files/zshrc"), "{err}");
    assert!(err.contains("init.luau:2"), "{err}");
}

#[test]
fn a_service_declares_exactly_one_schedule() {
    let home = tempfile::tempdir().unwrap();
    write(
        home.path(),
        "init.luau",
        &config(
            "niwa.service { label = \"dev.x.y\", program = { \"/bin/true\" }, interval = \"15m\", keepalive = true }\n",
        ),
    );
    let err = check_fails(home.path());
    assert!(err.contains("exactly one schedule"), "{err}");
}

#[test]
fn an_unpinned_use_is_rejected_with_the_pinned_form() {
    let home = tempfile::tempdir().unwrap();
    write(
        home.path(),
        "init.luau",
        &config("niwa.use(\"github:owner/repo\")\n"),
    );
    let err = check_fails(home.path());
    assert!(err.contains("pin a ref"), "{err}");
    assert!(err.contains("@v1"), "{err}");
}

#[test]
fn render_flows_into_file_content_and_validates_placeholders() {
    let home = tempfile::tempdir().unwrap();
    write(
        home.path(),
        "init.luau",
        &config(
            r#"local token = niwa.secret("github-token")
niwa.file("~/.netrc", {
  content = niwa.render("login {user} password {token}", { user = "me", token = token }),
  mode = "600",
})
"#,
        ),
    );
    assert_eq!(checks_clean(home.path()), "1 resource · config is valid\n");
}

#[test]
fn a_placeholder_without_a_value_is_rejected() {
    let home = tempfile::tempdir().unwrap();
    write(
        home.path(),
        "init.luau",
        &config("niwa.render(\"hello {name}\", {})\n"),
    );
    let err = check_fails(home.path());
    assert!(err.contains("{name}"), "{err}");
    assert!(err.contains("no value"), "{err}");
}

#[test]
fn a_custom_kind_must_state_its_reverse() {
    let home = tempfile::tempdir().unwrap();
    write(
        home.path(),
        "init.luau",
        &config(
            "niwa.resource(\"my.tool\", { check = function() return true end, apply = function() end, describe = function() return \"\" end })\n",
        ),
    );
    let err = check_fails(home.path());
    assert!(err.contains("reverse"), "{err}");
    assert!(err.contains("irreversible"), "{err}");
}

#[test]
fn a_custom_kind_cannot_shadow_a_built_in() {
    let home = tempfile::tempdir().unwrap();
    write(
        home.path(),
        "init.luau",
        &config(
            "niwa.resource(\"file\", { check = function() return true end, apply = function() end, reverse = false, describe = function() return \"\" end })\n",
        ),
    );
    let err = check_fails(home.path());
    assert!(err.contains("built-in"), "{err}");
}

#[test]
fn facts_and_queries_answer_inside_the_config() {
    let home = tempfile::tempdir().unwrap();
    write(
        home.path(),
        "init.luau",
        &config(
            r#"assert(type(niwa.machine.name) == "string")
assert(type(niwa.machine.arch) == "string")
assert(type(niwa.machine.tags) == "table")
assert(niwa.machine.tags.work == nil)
assert(type(niwa.home) == "string")
assert(niwa.exists("~/nothing-here") == false)
assert(niwa.command("niwa-not-a-command") == false)
assert(niwa.brew.prefix == "/opt/homebrew" or niwa.brew.prefix == "/usr/local")
"#,
        ),
    );
    checks_clean(home.path());
}

#[test]
fn results_are_frozen_and_carry_the_stub_shape() {
    let home = tempfile::tempdir().unwrap();
    write(
        home.path(),
        "init.luau",
        &config(
            r#"local result = niwa.brew.formula "neovim"
assert(table.isfrozen(result))
assert(result.changed == false)
assert(result.present == true)
local list = niwa.brew.formula { "fd", "jq" }
assert(table.isfrozen(list))
assert(list[1].changed == false)
assert(list[2].present == true)
"#,
        ),
    );
    checks_clean(home.path());
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

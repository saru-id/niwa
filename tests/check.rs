//! `niwa check` against real configs in throwaway homes. Every test
//! drives the built binary; nothing here touches the developer machine.

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

#[test]
fn a_missing_config_fails_and_names_the_place_to_create_it() {
    let home = tempfile::tempdir().unwrap();
    let output = niwa(home.path(), &["check"]);
    assert_eq!(output.status.code(), Some(1));
    let err = stderr(&output);
    assert!(err.contains("no config found"), "{err}");
    assert!(err.contains(".config/niwa"), "{err}");
    assert!(err.contains("init.luau"), "{err}");
}

#[test]
fn an_empty_config_is_valid_with_zero_resources() {
    let home = tempfile::tempdir().unwrap();
    write(home.path(), "init.luau", "");
    let output = niwa(home.path(), &["check"]);
    assert_eq!(output.status.code(), Some(0), "{}", stderr(&output));
    assert_eq!(
        stdout(&output),
        "0 resources · config is valid\nluau-analyze is not installed · deeper type checks were skipped\n"
    );
}

#[test]
fn a_syntax_error_names_the_file_and_line() {
    let home = tempfile::tempdir().unwrap();
    write(home.path(), "init.luau", "local x =\n");
    let output = niwa(home.path(), &["check"]);
    assert_eq!(output.status.code(), Some(1));
    let err = stderr(&output);
    assert!(err.contains("init.luau"), "{err}");
}

#[test]
fn modules_load_through_the_self_alias_and_return_values() {
    let home = tempfile::tempdir().unwrap();
    write(home.path(), "modules/answer.luau", "return 42\n");
    write(
        home.path(),
        "init.luau",
        "local v = require(\"@self/modules/answer\")\nassert(v == 42)\n",
    );
    let output = niwa(home.path(), &["check"]);
    assert_eq!(output.status.code(), Some(0), "{}", stderr(&output));
}

#[test]
fn a_module_is_loaded_once_and_cached() {
    let home = tempfile::tempdir().unwrap();
    write(home.path(), "modules/counter.luau", "return {}\n");
    write(
        home.path(),
        "init.luau",
        "local a = require(\"@self/modules/counter\")\n\
         local b = require(\"@self/modules/counter\")\n\
         assert(a == b)\n",
    );
    let output = niwa(home.path(), &["check"]);
    assert_eq!(output.status.code(), Some(0), "{}", stderr(&output));
}

#[test]
fn a_require_cycle_is_reported_as_a_chain() {
    let home = tempfile::tempdir().unwrap();
    write(
        home.path(),
        "modules/a.luau",
        "require(\"@self/modules/b\")\n",
    );
    write(
        home.path(),
        "modules/b.luau",
        "require(\"@self/modules/a\")\n",
    );
    write(home.path(), "init.luau", "require(\"@self/modules/a\")\n");
    let output = niwa(home.path(), &["check"]);
    assert_eq!(output.status.code(), Some(1));
    let err = stderr(&output);
    assert!(err.contains("require cycle"), "{err}");
    assert!(err.contains("modules/a.luau"), "{err}");
}

#[test]
fn an_unknown_alias_is_rejected_with_the_two_that_exist() {
    let home = tempfile::tempdir().unwrap();
    write(home.path(), "init.luau", "require(\"@vendor/thing\")\n");
    let output = niwa(home.path(), &["check"]);
    assert_eq!(output.status.code(), Some(1));
    let err = stderr(&output);
    assert!(err.contains("@self"), "{err}");
    assert!(err.contains("@niwa"), "{err}");
}

#[test]
fn a_missing_module_reports_both_candidate_paths() {
    let home = tempfile::tempdir().unwrap();
    write(
        home.path(),
        "init.luau",
        "require(\"@self/modules/gone\")\n",
    );
    let output = niwa(home.path(), &["check"]);
    assert_eq!(output.status.code(), Some(1));
    let err = stderr(&output);
    assert!(err.contains("modules/gone.luau"), "{err}");
    assert!(err.contains("modules/gone/init.luau"), "{err}");
}

#[test]
fn a_path_that_escapes_the_config_is_rejected() {
    let home = tempfile::tempdir().unwrap();
    write(home.path(), "init.luau", "require(\"@self/../outside\")\n");
    let output = niwa(home.path(), &["check"]);
    assert_eq!(output.status.code(), Some(1));
    assert!(stderr(&output).contains(".."));
}

#[test]
fn the_sandbox_offers_no_way_to_reach_the_system() {
    let home = tempfile::tempdir().unwrap();
    write(
        home.path(),
        "init.luau",
        "assert(io == nil)\n\
         assert(os.execute == nil)\n\
         assert(os.remove == nil)\n\
         assert(os.getenv == nil)\n\
         assert(dofile == nil)\n\
         assert(loadstring == nil)\n\
         assert(package == nil)\n",
    );
    let output = niwa(home.path(), &["check"]);
    assert_eq!(output.status.code(), Some(0), "{}", stderr(&output));
}

#[test]
fn the_niwa_alias_resolves_to_a_frozen_table() {
    let home = tempfile::tempdir().unwrap();
    write(
        home.path(),
        "init.luau",
        "local niwa = require(\"@niwa\")\n\
         assert(type(niwa) == \"table\")\n\
         assert(table.isfrozen(niwa))\n",
    );
    let output = niwa(home.path(), &["check"]);
    assert_eq!(output.status.code(), Some(0), "{}", stderr(&output));
}

#[test]
fn xdg_config_home_is_honored_when_absolute() {
    let home = tempfile::tempdir().unwrap();
    let elsewhere = tempfile::tempdir().unwrap();
    let config = elsewhere.path().join("niwa");
    std::fs::create_dir_all(&config).unwrap();
    std::fs::write(config.join("init.luau"), "").unwrap();
    let output = Command::new(env!("CARGO_BIN_EXE_niwa"))
        .arg("check")
        .env_clear()
        .env("HOME", home.path())
        .envs(coverage_env())
        .env("XDG_CONFIG_HOME", elsewhere.path())
        .output()
        .unwrap();
    assert_eq!(output.status.code(), Some(0), "{}", stderr(&output));
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

//! The one hermetic runner every integration suite shares. Hermetic
//! by construction: every spawn gets a sandbox home, sandboxed
//! managed preferences, and a sandboxed Homebrew prefix — no copy of
//! this helper can drift into reading the developer machine.

#![allow(dead_code, reason = "each suite uses the subset of helpers it needs")]

use std::path::Path;
use std::process::{Command, Output};

/// A command wired to the sandbox; suites add their own args/envs.
pub fn command(home: &Path) -> Command {
    // The binary runs under perl's alarm: every spawned process in
    // the test tier carries a deadline, the same law the drills keep.
    let mut command = Command::new("/usr/bin/perl");
    command
        .args([
            "-e",
            "alarm shift; exec @ARGV or die \"exec: $!\"",
            "--",
            "60",
        ])
        .arg(env!("CARGO_BIN_EXE_niwa"))
        .env_clear()
        .env("HOME", home)
        .env("NIWA_MANAGED_PREFS", home.join("managed"))
        .env("HOMEBREW_PREFIX", home.join("brew"))
        .envs(coverage_env());
    command
}

pub fn niwa(home: &Path, envs: &[(&str, &str)], args: &[&str]) -> Output {
    let mut command = command(home);
    command.args(args);
    for (key, value) in envs {
        command.env(key, value);
    }
    command.output().unwrap()
}

pub fn write(home: &Path, rel: &str, content: &str) {
    let path = home.join(".config/niwa").join(rel);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, content).unwrap();
}

pub fn stdout(output: &Output) -> String {
    String::from_utf8(output.stdout.clone()).unwrap()
}

pub fn stderr(output: &Output) -> String {
    String::from_utf8(output.stderr.clone()).unwrap()
}

/// Instrumented builds tell children where to write coverage profiles
/// through this variable; without it an instrumented child dumps a
/// `default_*.profraw` into its working directory. Passing it through
/// keeps coverage collectable and the filesystem clean.
pub fn coverage_env() -> impl Iterator<Item = (&'static str, std::ffi::OsString)> {
    std::env::var_os("LLVM_PROFILE_FILE")
        .map(|value| ("LLVM_PROFILE_FILE", value))
        .into_iter()
}

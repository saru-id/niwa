//! The example config is the acceptance suite: it uses every feature
//! of the API, and it must stay valid. These tests run the real binary
//! against the vendored copy in `tests/fixtures/example`.

#![allow(
    clippy::unwrap_used,
    reason = "this is a test crate; tests panic loudly by design"
)]

mod common;

use std::path::{Path, PathBuf};
use std::process::Output;

/// Copy the example config into a throwaway home and return it.
fn example_home() -> tempfile::TempDir {
    let home = tempfile::tempdir().unwrap();
    let source = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/example");
    let target = home.path().join(".config/niwa");
    copy_tree(&source, &target);
    home
}

fn copy_tree(source: &Path, target: &Path) {
    std::fs::create_dir_all(target).unwrap();
    for entry in std::fs::read_dir(source).unwrap() {
        let entry = entry.unwrap();
        let to = target.join(entry.file_name());
        if entry.file_type().unwrap().is_dir() {
            copy_tree(&entry.path(), &to);
        } else {
            std::fs::copy(entry.path(), &to).unwrap();
        }
    }
}

/// A bin directory whose `scutil` answers with the given machine
/// name, so `niwa.host()` finds the matching host file.
fn stub_machine_name(home: &Path, name: &str) -> PathBuf {
    let bin = home.join("stub-bin");
    std::fs::create_dir_all(&bin).unwrap();
    let script = bin.join("scutil");
    std::fs::write(&script, format!("#!/bin/sh\necho {name}\n")).unwrap();
    let mut permissions = std::fs::metadata(&script).unwrap().permissions();
    std::os::unix::fs::PermissionsExt::set_mode(&mut permissions, 0o755);
    std::fs::set_permissions(&script, permissions).unwrap();
    bin
}

fn check(home: &Path, path: Option<&Path>) -> Output {
    let mut command = common::command(home);
    command.arg("check");
    if let Some(path) = path {
        command.env("PATH", path);
    }
    command.output().unwrap()
}

#[test]
fn the_example_config_checks_clean() {
    let home = example_home();
    let output = check(home.path(), None);
    assert_eq!(
        output.status.code(),
        Some(0),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let stdout = String::from_utf8(output.stdout).unwrap();
    assert!(stdout.contains("config is valid"), "{stdout}");
}

#[test]
fn the_example_config_checks_clean_as_each_host() {
    for name in ["airborne", "workhorse"] {
        let home = example_home();
        let bin = stub_machine_name(home.path(), name);
        let output = check(home.path(), Some(&bin));
        assert_eq!(
            output.status.code(),
            Some(0),
            "as {name}: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
}

#[test]
fn the_host_overrides_change_the_count_not_the_verdict() {
    let plain = {
        let home = example_home();
        let output = check(home.path(), None);
        assert_eq!(output.status.code(), Some(0));
        String::from_utf8(output.stdout).unwrap()
    };
    let as_airborne = {
        let home = example_home();
        let bin = stub_machine_name(home.path(), "airborne");
        String::from_utf8(check(home.path(), Some(&bin)).stdout).unwrap()
    };
    assert_ne!(plain, as_airborne, "airborne adds casks and a hostname");
}

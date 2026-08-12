//! Property simulations on the real binary: for any generated
//! machine, apply converges, a second apply changes nothing, and
//! undo restores what stood before. Every case runs in its own
//! throwaway home; the generator never reaches for a package
//! manager, so the properties hold hermetically.

#![allow(
    clippy::unwrap_used,
    reason = "this is a test crate; tests panic loudly by design"
)]

use std::path::Path;
use std::process::{Command, Output};

use proptest::prelude::*;

fn niwa(home: &Path, args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_niwa"))
        .args(args)
        .env_clear()
        .env("HOME", home)
        .env("NIWA_MANAGED_PREFS", home.join("managed"))
        .envs(coverage_env())
        .output()
        .unwrap()
}

/// One generated resource: a file with declared content, or a link
/// to a repo-held source file.
#[derive(Debug, Clone)]
enum Resource {
    File { name: String, content: String },
    Link { name: String, source: String },
}

fn resource() -> impl Strategy<Value = Resource> {
    let name = "[a-z][a-z0-9]{1,8}";
    let content = "[ -~]{0,40}";
    prop_oneof![
        (name, content).prop_map(|(name, content)| Resource::File { name, content }),
        (name, content).prop_map(|(name, source)| Resource::Link { name, source }),
    ]
}

/// A machine: up to six resources with distinct target names.
fn machine() -> impl Strategy<Value = Vec<Resource>> {
    proptest::collection::vec(resource(), 1..6).prop_map(|resources| {
        let mut seen = std::collections::HashSet::new();
        resources
            .into_iter()
            .filter(|resource| {
                let name = match resource {
                    Resource::File { name, .. } | Resource::Link { name, .. } => name.clone(),
                };
                seen.insert(name)
            })
            .collect()
    })
}

fn write_config(home: &Path, resources: &[Resource]) {
    let config = home.join(".config/niwa");
    std::fs::create_dir_all(config.join("files")).unwrap();
    let mut script = String::from("local niwa = require(\"@niwa\")\n");
    for resource in resources {
        match resource {
            Resource::File { name, content } => {
                use std::fmt::Write as _;
                let escaped = content.replace('\\', "\\\\").replace('"', "\\\"");
                let _ = writeln!(
                    script,
                    "niwa.file(\"~/.sim-{name}\", {{ content = \"{escaped}\" }})"
                );
            }
            Resource::Link { name, source } => {
                use std::fmt::Write as _;
                std::fs::write(config.join("files").join(name), source).unwrap();
                let _ = writeln!(
                    script,
                    "niwa.link(\"~/.sim-{name}\", {{ to = \"@self/files/{name}\" }})"
                );
            }
        }
    }
    std::fs::write(config.join("init.luau"), script).unwrap();
}

fn targets(resources: &[Resource]) -> Vec<String> {
    resources
        .iter()
        .map(|resource| match resource {
            Resource::File { name, .. } | Resource::Link { name, .. } => format!(".sim-{name}"),
        })
        .collect()
}

proptest! {
    #![proptest_config(ProptestConfig {
        cases: 12,
        .. ProptestConfig::default()
    })]

    /// Apply converges, and applying a converged machine changes
    /// nothing: plan answers 0, and every byte stays put.
    #[test]
    fn apply_is_idempotent(resources in machine()) {
        let home = tempfile::tempdir().unwrap();
        write_config(home.path(), &resources);

        let first = niwa(home.path(), &["apply", "--yes", "--dirty"]);
        prop_assert_eq!(first.status.code(), Some(0));
        let after_first: Vec<_> = targets(&resources)
            .iter()
            .map(|target| std::fs::read(home.path().join(target)).unwrap())
            .collect();

        let plan = niwa(home.path(), &["plan"]);
        prop_assert_eq!(plan.status.code(), Some(0), "not converged: {}",
            String::from_utf8_lossy(&plan.stdout));

        let second = niwa(home.path(), &["apply", "--yes", "--dirty"]);
        prop_assert_eq!(second.status.code(), Some(0));
        for (target, before) in targets(&resources).iter().zip(&after_first) {
            prop_assert_eq!(&std::fs::read(home.path().join(target)).unwrap(), before);
        }
    }

    /// Undo restores the world before the apply: targets that did
    /// not exist are gone again, and the journal forgets the apply.
    #[test]
    fn undo_restores_what_stood_before(resources in machine()) {
        let home = tempfile::tempdir().unwrap();
        write_config(home.path(), &resources);

        let apply = niwa(home.path(), &["apply", "--yes", "--dirty"]);
        prop_assert_eq!(apply.status.code(), Some(0));

        let undo = niwa(home.path(), &["undo", "--yes"]);
        prop_assert_eq!(undo.status.code(), Some(0), "undo failed: {}",
            String::from_utf8_lossy(&undo.stderr));
        for target in targets(&resources) {
            let path = home.path().join(&target);
            prop_assert!(
                std::fs::symlink_metadata(&path).is_err(),
                "{target} survived undo"
            );
        }
    }
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

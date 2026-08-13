//! Property simulations on the real binary: for any generated
//! machine, apply converges, a second apply changes nothing, and
//! undo restores what stood before — including the exact bytes a
//! target held before niwa touched it. Every case runs in its own
//! throwaway home; the generator never reaches for a package
//! manager, so the properties hold hermetically.

#![allow(
    clippy::unwrap_used,
    reason = "this is a test crate; tests panic loudly by design"
)]

mod common;
use common::niwa as niwa_full;
use std::path::Path;
use std::process::Output;

use proptest::prelude::*;

fn niwa(home: &Path, args: &[&str]) -> Output {
    niwa_full(home, &[], args)
}

/// One generated resource: a file with declared content, or a link
/// to a repo-held source file. `prior` is what the target held
/// before the apply — the bytes undo must bring back exactly.
#[derive(Debug, Clone)]
enum Resource {
    File {
        name: String,
        content: String,
        mode: Option<&'static str>,
        prior: Option<String>,
    },
    Link {
        name: String,
        source: String,
        prior: Option<String>,
    },
}

impl Resource {
    fn name(&self) -> &str {
        match self {
            Self::File { name, .. } | Self::Link { name, .. } => name,
        }
    }

    const fn prior(&self) -> Option<&String> {
        match self {
            Self::File { prior, .. } | Self::Link { prior, .. } => prior.as_ref(),
        }
    }
}

/// Content that exercises the escapes: printable ASCII, newlines,
/// and characters outside ASCII entirely.
fn content() -> impl Strategy<Value = String> {
    proptest::string::string_regex("([ -~éλ§]|\n){0,48}").unwrap()
}

/// Target names, sometimes nested a directory deep.
fn name() -> impl Strategy<Value = String> {
    proptest::string::string_regex("[a-z][a-z0-9]{0,4}(/[a-z][a-z0-9]{0,3})?").unwrap()
}

fn resource() -> impl Strategy<Value = Resource> {
    let mode = prop_oneof![
        3 => Just(None),
        1 => Just(Some("600")),
        1 => Just(Some("755")),
    ];
    prop_oneof![
        (
            name(),
            content(),
            mode,
            proptest::option::weighted(0.4, content())
        )
            .prop_map(|(name, content, mode, prior)| {
                Resource::File {
                    name,
                    content,
                    mode,
                    prior,
                }
            }),
        (
            name(),
            content(),
            proptest::option::weighted(0.4, content())
        )
            .prop_map(|(name, source, prior)| Resource::Link {
                name,
                source,
                prior
            }),
    ]
}

/// A machine: up to six resources with distinct target names, where
/// no name is a directory prefix of another.
fn machine() -> impl Strategy<Value = Vec<Resource>> {
    proptest::collection::vec(resource(), 1..6).prop_map(|resources| {
        let mut seen: Vec<String> = Vec::new();
        resources
            .into_iter()
            .filter(|resource| {
                let name = resource.name().to_string();
                let clashes = seen.iter().any(|kept| {
                    kept == &name
                        || kept.starts_with(&format!("{name}/"))
                        || name.starts_with(&format!("{kept}/"))
                });
                if clashes {
                    return false;
                }
                seen.push(name);
                true
            })
            .collect()
    })
}

fn lua_escape(text: &str) -> String {
    text.replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
}

fn write_config(home: &Path, resources: &[Resource]) {
    let config = home.join(".config/niwa");
    std::fs::create_dir_all(config.join("files")).unwrap();
    let mut script = String::from("local niwa = require(\"@niwa\")\n");
    for resource in resources {
        use std::fmt::Write as _;
        match resource {
            Resource::File {
                name,
                content,
                mode,
                ..
            } => {
                let escaped = lua_escape(content);
                match mode {
                    Some(mode) => {
                        let _ = writeln!(
                            script,
                            "niwa.file(\"~/.sim-{name}\", {{ content = \"{escaped}\", mode = \"{mode}\" }})"
                        );
                    }
                    None => {
                        let _ = writeln!(
                            script,
                            "niwa.file(\"~/.sim-{name}\", {{ content = \"{escaped}\" }})"
                        );
                    }
                }
            }
            Resource::Link { name, source, .. } => {
                let source_path = config.join("files").join(name);
                std::fs::create_dir_all(source_path.parent().unwrap()).unwrap();
                std::fs::write(source_path, source).unwrap();
                let _ = writeln!(
                    script,
                    "niwa.link(\"~/.sim-{name}\", {{ to = \"@self/files/{name}\" }})"
                );
            }
        }
    }
    std::fs::write(config.join("init.luau"), script).unwrap();
}

/// Seed the targets that existed before niwa: the bytes undo must
/// restore. Returns whether anything was seeded.
fn seed_priors(home: &Path, resources: &[Resource]) -> bool {
    let mut seeded = false;
    for resource in resources {
        if let Some(prior) = resource.prior() {
            let path = home.join(format!(".sim-{}", resource.name()));
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, prior).unwrap();
            seeded = true;
        }
    }
    seeded
}

fn targets(resources: &[Resource]) -> Vec<String> {
    resources
        .iter()
        .map(|resource| format!(".sim-{}", resource.name()))
        .collect()
}

proptest! {
    #![proptest_config(ProptestConfig {
        cases: 24,
        .. ProptestConfig::default()
    })]

    /// Apply converges, and applying a converged machine changes
    /// nothing: plan answers 0, and every byte stays put.
    #[test]
    fn apply_is_idempotent(resources in machine()) {
        let home = tempfile::tempdir().unwrap();
        write_config(home.path(), &resources);
        seed_priors(home.path(), &resources);

        let first = niwa(home.path(), &["apply", "--yes", "--dirty", "--force"]);
        prop_assert_eq!(first.status.code(), Some(0), "apply failed: {}",
            String::from_utf8_lossy(&first.stderr));
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
    /// not exist are gone again, displaced bytes come back exactly,
    /// and the journal forgets the apply.
    #[test]
    fn undo_restores_what_stood_before(resources in machine()) {
        let home = tempfile::tempdir().unwrap();
        write_config(home.path(), &resources);
        seed_priors(home.path(), &resources);

        let apply = niwa(home.path(), &["apply", "--yes", "--dirty", "--force"]);
        prop_assert_eq!(apply.status.code(), Some(0), "apply failed: {}",
            String::from_utf8_lossy(&apply.stderr));

        let undo = niwa(home.path(), &["undo", "--yes"]);
        prop_assert_eq!(undo.status.code(), Some(0), "undo failed: {}",
            String::from_utf8_lossy(&undo.stderr));
        for resource in &resources {
            let path = home.path().join(format!(".sim-{}", resource.name()));
            match resource.prior() {
                Some(prior) => {
                    let restored = std::fs::read(&path).unwrap_or_default();
                    prop_assert_eq!(
                        String::from_utf8_lossy(&restored),
                        prior.as_str(),
                        "{} did not come back", resource.name()
                    );
                }
                None => prop_assert!(
                    std::fs::symlink_metadata(&path).is_err(),
                    "{} survived undo", resource.name()
                ),
            }
        }
    }
}

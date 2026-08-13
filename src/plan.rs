//! The plan: declared versus actual, one comparison per identity.
//!
//! `compare` dispatches every kind to the provider that reads it;
//! nothing here writes to the machine. The file and link read halves
//! live in this module; every other kind answers through its own
//! provider module.

use std::fmt::Write as _;
use std::path::Path;

use crate::journal::{Journal, digest};
use crate::model::action::Action;
use crate::model::{Declaration, Kind, Value};
use crate::paths::Paths;

/// Compare one declaration with the machine. The engine calls this
/// per declaration, in both passes.
pub fn compare(
    declaration: &Declaration,
    paths: &Paths,
    journal: &Journal,
    lock: &crate::lockfile::Lockfile,
) -> Action {
    match &declaration.identity.kind {
        Kind::File => compare_file(declaration, paths, journal),
        Kind::Link => compare_link(declaration, paths),
        Kind::Defaults => crate::defaults::compare(declaration, paths),
        Kind::BrewFormula | Kind::BrewCask => {
            match crate::brew::installed(
                paths,
                &declaration.identity.kind,
                &declaration.identity.key,
            ) {
                Some(_) => Action::InSync,
                None => Action::Create,
            }
        }
        Kind::Npm => {
            if crate::npm::installed(&declaration.identity.key) {
                Action::InSync
            } else {
                Action::Create
            }
        }
        Kind::Mise => {
            let pinned = lock
                .mise
                .get(&declaration.identity.key)
                .map(|pin| pin.version.as_str());
            match crate::mise::installed(paths, &declaration.identity.key, pinned) {
                Some(_) => Action::InSync,
                None if pinned.is_some() => Action::Change {
                    detail: format!("pinned {} waits", pinned.unwrap_or_default()),
                },
                None => Action::Create,
            }
        }
        Kind::Service => match crate::services::agent_in_sync(paths, declaration) {
            Some(true) => Action::InSync,
            Some(false) => Action::Change {
                detail: "definition changed".to_string(),
            },
            None => Action::Create,
        },
        Kind::BrewService => {
            if crate::services::brew_service_plist(paths, &declaration.identity.key).is_file() {
                Action::InSync
            } else {
                Action::Create
            }
        }
        Kind::GithubRelease => {
            let target = crate::release::bin_dir(paths).join(crate::release::bin_of(declaration));
            match std::fs::read(&target) {
                Ok(current) => {
                    // Present is not convergence. The acknowledgement
                    // holds two facts: the installed binary's digest
                    // (a hand swap is drift, and stays protected) and
                    // the pin it came from (a bump is pending work).
                    let Some(pin) = lock.github_release.get(&declaration.identity.key) else {
                        return Action::InSync;
                    };
                    let ack = journal.acknowledged(&declaration.identity.to_string());
                    let same_pin = ack
                        .and_then(|ack| ack.context.as_deref())
                        .is_some_and(|context| context == pin.sha256);
                    let same_bytes = ack
                        .and_then(|ack| ack.bytes.as_deref())
                        .is_some_and(|sha| sha == crate::util::digest(&current));
                    if same_pin && same_bytes {
                        Action::InSync
                    } else if same_pin {
                        Action::Change {
                            detail: "the binary differs from the applied pin".to_string(),
                        }
                    } else {
                        Action::Change {
                            detail: format!("pinned {} waits", pin.version),
                        }
                    }
                }
                Err(_) => Action::Create,
            }
        }
        Kind::Run => crate::exec::compare_run(declaration, paths),
        Kind::Once => crate::exec::compare_once(declaration, journal),
        _ => Action::Unchecked,
    }
}

fn compare_file(declaration: &Declaration, paths: &Paths, journal: &Journal) -> Action {
    let Some(fields) = declaration.fields() else {
        return Action::Unchecked;
    };
    let target = paths.expand_home(&declaration.identity.key);

    // What should the bytes be? A plain source or content is known
    // now. Rendered content resolves at apply time, so the plan leans
    // on the journal: same spec, same bytes on disk, nothing to do.
    if matches!(fields.get("content"), Some(Value::Map(_))) {
        return rendered_action(declaration, journal, &target);
    }
    let declared = crate::apply::declared_file_bytes(paths, declaration);
    let Some(declared) = declared else {
        return Action::Change {
            detail: "source unreadable".to_string(),
        };
    };

    match std::fs::read(&target) {
        Ok(actual) if actual == declared => mode_action(fields, &target),
        Ok(_) => Action::Change {
            detail: "content differs".to_string(),
        },
        Err(_) => Action::Create,
    }
}

/// A rendered file is in sync when the journal acknowledges this very
/// spec and the bytes on disk are the bytes that apply wrote.
fn rendered_action(declaration: &Declaration, journal: &Journal, target: &Path) -> Action {
    let identity = declaration.identity.to_string();
    match (journal.acknowledged(&identity), std::fs::read(target)) {
        (Some(ack), Ok(actual))
            if ack.spec == declaration.spec
                && ack.bytes.as_deref() == Some(digest(&actual).as_str()) =>
        {
            Action::InSync
        }
        (_, Err(_)) => Action::Create,
        _ => Action::Change {
            detail: "rendered content".to_string(),
        },
    }
}

/// Bytes match; the mode may still differ.
fn mode_action(fields: &std::collections::BTreeMap<String, Value>, target: &Path) -> Action {
    let Some(Value::Int(declared_mode)) = fields.get("mode") else {
        return Action::InSync;
    };
    let actual_mode = std::fs::metadata(target).map_or(0, |meta| {
        use std::os::unix::fs::PermissionsExt as _;
        i64::from(meta.permissions().mode() & 0o7777)
    });
    if actual_mode == *declared_mode {
        Action::InSync
    } else {
        Action::Change {
            detail: format!("mode {actual_mode:o} → {declared_mode:o}"),
        }
    }
}

fn compare_link(declaration: &Declaration, paths: &Paths) -> Action {
    let Some(fields) = declaration.fields() else {
        return Action::Unchecked;
    };
    let Some(Value::Str(to)) = fields.get("to") else {
        return Action::Unchecked;
    };
    let Some(rest) = to.strip_prefix("@self/") else {
        return Action::Unchecked;
    };
    let expected = paths.config.join(rest);
    let target = paths.expand_home(&declaration.identity.key);

    match std::fs::read_link(&target) {
        Ok(actual) if actual == expected => Action::InSync,
        Ok(_) => Action::Change {
            detail: "points elsewhere".to_string(),
        },
        Err(_) if target.exists() => Action::Change {
            detail: "a file is in the way".to_string(),
        },
        Err(_) => Action::Create,
    }
}

/// One-line rendering for plan transitions: `false → true`, `40 → 48`.
pub fn render_value(value: &Value) -> String {
    match value {
        Value::Bool(b) => b.to_string(),
        Value::Int(i) => i.to_string(),
        Value::Float(f) => f.to_string(),
        Value::Str(s) => s.clone(),
        Value::List(items) => {
            let mut out = String::from("[");
            for (index, item) in items.iter().enumerate() {
                if index > 0 {
                    out.push_str(", ");
                }
                let _ = write!(out, "{}", render_value(item));
            }
            out.push(']');
            out
        }
        Value::Map(map) => format!("{{{} keys}}", map.len()),
    }
}

#[cfg(test)]
mod tests {
    fn lock_default() -> crate::lockfile::Lockfile {
        crate::lockfile::Lockfile::default()
    }

    use super::*;
    use crate::model::{Identity, Provenance, Unit};
    use std::collections::BTreeMap;

    fn paths_in(dir: &Path) -> Paths {
        Paths {
            home: dir.to_path_buf(),
            config: dir.join(".config/niwa"),
            state: dir.join(".local/state/niwa"),
            brew_prefix: dir.join("brew"),
            data: dir.join(".local/share"),
        }
    }

    fn file_declaration(target: &str, source: &str) -> Declaration {
        let mut fields = BTreeMap::new();
        fields.insert("source".to_string(), Value::Str(source.to_string()));
        Declaration {
            identity: Identity::new(Kind::File, target),
            spec: Value::Map(fields),
            provenance: Provenance {
                file: "test.luau".to_string(),
                line: 1,
            },
            unit: Unit::Init,
            privileged: false,
        }
    }

    #[test]
    fn a_missing_file_is_a_create_and_a_matching_file_is_in_sync() {
        let dir = tempfile::tempdir().unwrap();
        let paths = paths_in(dir.path());
        std::fs::create_dir_all(paths.config.join("files")).unwrap();
        std::fs::write(paths.config.join("files/zshrc"), "alias ls=eza\n").unwrap();

        let declaration = file_declaration("~/.zshrc", "@self/files/zshrc");
        let journal = Journal::default();

        let action = compare(
            &declaration,
            &paths,
            &journal,
            &crate::lockfile::Lockfile::default(),
        );
        assert!(matches!(action, Action::Create));

        std::fs::write(dir.path().join(".zshrc"), "alias ls=eza\n").unwrap();
        let action = compare(
            &declaration,
            &paths,
            &journal,
            &crate::lockfile::Lockfile::default(),
        );
        assert!(matches!(action, Action::InSync));

        std::fs::write(dir.path().join(".zshrc"), "alias ls=exa\n").unwrap();
        let action = compare(
            &declaration,
            &paths,
            &journal,
            &crate::lockfile::Lockfile::default(),
        );
        assert!(matches!(action, Action::Change { .. }));
    }

    #[test]
    fn a_defaults_key_compares_against_the_plist_on_disk() {
        let dir = tempfile::tempdir().unwrap();
        let paths = paths_in(dir.path());
        let preferences = dir.path().join("Library/Preferences");
        std::fs::create_dir_all(&preferences).unwrap();
        let mut dict = plist::Dictionary::new();
        dict.insert("autohide".to_string(), plist::Value::Boolean(false));
        dict.insert("tilesize".to_string(), plist::Value::Integer(48.into()));
        plist::Value::Dictionary(dict)
            .to_file_binary(preferences.join("com.apple.dock.plist"))
            .unwrap();

        let mut fields = BTreeMap::new();
        fields.insert("value".to_string(), Value::Bool(true));
        let declaration = Declaration {
            identity: Identity::new(Kind::Defaults, "com.apple.dock:autohide"),
            spec: Value::Map(fields),
            provenance: Provenance {
                file: "test.luau".to_string(),
                line: 1,
            },
            unit: Unit::Init,
            privileged: false,
        };
        let journal = Journal::default();
        let Action::Change { detail } = compare(&declaration, &paths, &journal, &lock_default())
        else {
            panic!("expected a change");
        };
        assert_eq!(detail, "false → true");

        let mut fields = BTreeMap::new();
        fields.insert("value".to_string(), Value::Int(48));
        let declaration = Declaration {
            identity: Identity::new(Kind::Defaults, "com.apple.dock:tilesize"),
            spec: Value::Map(fields),
            provenance: Provenance {
                file: "test.luau".to_string(),
                line: 1,
            },
            unit: Unit::Init,
            privileged: false,
        };
        assert!(matches!(
            compare(&declaration, &paths, &journal, &lock_default()),
            Action::InSync
        ));

        let mut fields = BTreeMap::new();
        fields.insert("value".to_string(), Value::Bool(true));
        let declaration = Declaration {
            identity: Identity::new(Kind::Defaults, "com.apple.dock:orientation"),
            spec: Value::Map(fields),
            provenance: Provenance {
                file: "test.luau".to_string(),
                line: 1,
            },
            unit: Unit::Init,
            privileged: false,
        };
        assert!(matches!(
            compare(&declaration, &paths, &journal, &lock_default()),
            Action::Create
        ));
    }

    #[test]
    fn an_unbuilt_provider_reports_unchecked_not_a_guess() {
        let dir = tempfile::tempdir().unwrap();
        let paths = paths_in(dir.path());
        let declaration = Declaration {
            identity: Identity::new(Kind::Permission, "Ghostty:accessibility"),
            spec: Value::Map(BTreeMap::new()),
            provenance: Provenance {
                file: "test.luau".to_string(),
                line: 1,
            },
            unit: Unit::Init,
            privileged: false,
        };
        let journal = Journal::default();
        assert!(matches!(
            compare(&declaration, &paths, &journal, &lock_default()),
            Action::Unchecked
        ));
    }
}

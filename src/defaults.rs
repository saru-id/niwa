//! The macOS preferences provider. niwa reads and writes plists
//! directly; it never shells out to the `defaults` tool. Both halves
//! of the conversion pair live here, beside the compare and the
//! write, so every module that touches a preference goes through one
//! door.

use std::path::PathBuf;

use crate::model::action::Action;
use crate::model::{Declaration, Kind, Value};
use crate::paths::Paths;

/// Where a preference domain lives on disk.
pub fn domain_path(paths: &Paths, domain: &str) -> PathBuf {
    domain.strip_prefix('/').map_or_else(
        || {
            if domain == "NSGlobalDomain" {
                paths
                    .home
                    .join("Library/Preferences/.GlobalPreferences.plist")
            } else {
                paths
                    .home
                    .join(format!("Library/Preferences/{domain}.plist"))
            }
        },
        |rest| PathBuf::from(format!("/{rest}.plist")),
    )
}

/// Canonicalize a plist value into the model's shape. Dates and raw
/// data cannot be declared from a config, so they render as opaque
/// strings and always read as a difference.
pub fn plist_to_value(value: &plist::Value) -> Value {
    match value {
        plist::Value::Boolean(b) => Value::Bool(*b),
        plist::Value::Integer(i) => i
            .as_signed()
            .map_or_else(|| Value::Str(i.to_string()), Value::Int),
        plist::Value::Real(r) => {
            if r.fract() == 0.0 && r.abs() < 9_007_199_254_740_992.0 {
                #[allow(
                    clippy::cast_possible_truncation,
                    reason = "the fract check proves the cast is exact"
                )]
                Value::Int(*r as i64)
            } else {
                Value::Float(*r)
            }
        }
        plist::Value::String(s) => Value::Str(s.clone()),
        plist::Value::Array(items) => Value::List(items.iter().map(plist_to_value).collect()),
        plist::Value::Dictionary(dict) => Value::Map(
            dict.iter()
                .map(|(key, value)| (key.clone(), plist_to_value(value)))
                .collect(),
        ),
        other => Value::Str(format!("{other:?}")),
    }
}

/// The model's shape back into a plist, for writes.
/// Finder view styles: the sugar's readable names and the codes the
/// plist stores. One table, read in both directions.
pub const FINDER_VIEWS: [(&str, &str); 4] = [
    ("list", "Nlsv"),
    ("icon", "icnv"),
    ("column", "clmv"),
    ("gallery", "glyv"),
];

pub fn value_to_plist(value: &Value) -> plist::Value {
    match value {
        Value::Bool(b) => plist::Value::Boolean(*b),
        Value::Int(i) => plist::Value::Integer((*i).into()),
        Value::Float(f) => plist::Value::Real(*f),
        Value::Str(s) => plist::Value::String(s.clone()),
        Value::List(items) => plist::Value::Array(items.iter().map(value_to_plist).collect()),
        Value::Map(fields) => plist::Value::Dictionary(
            fields
                .iter()
                .map(|(key, value)| (key.clone(), value_to_plist(value)))
                .collect(),
        ),
    }
}

/// Compare one declared key with the domain's live plist.
pub fn compare(declaration: &Declaration, paths: &Paths) -> Action {
    let Value::Map(fields) = &declaration.spec else {
        return Action::Unchecked;
    };
    let Some(declared) = fields.get("value") else {
        return Action::Unchecked;
    };
    let Some((domain, key)) = declaration.identity.key.split_once(':') else {
        return Action::Unchecked;
    };

    let store = domain_path(paths, domain);
    let Ok(root) = plist::Value::from_file(&store) else {
        // No preference file yet: the key does not exist.
        return Action::Create;
    };
    let actual = root
        .as_dictionary()
        .and_then(|dict| dict.get(key))
        .map(plist_to_value);

    match actual {
        None => Action::Create,
        Some(actual) if &actual == declared => Action::InSync,
        Some(actual) => Action::Change {
            detail: format!(
                "{} → {}",
                crate::plan::render_value(&actual),
                crate::plan::render_value(declared)
            ),
        },
    }
}

/// The process a defaults declaration asks to bounce after its write,
/// when it names one.
pub fn restart_target(declaration: &Declaration) -> Option<String> {
    if !matches!(declaration.identity.kind, Kind::Defaults) {
        return None;
    }
    let Value::Map(fields) = &declaration.spec else {
        return None;
    };
    match fields.get("restart") {
        Some(Value::Str(target)) => Some(target.clone()),
        _ => None,
    }
}

/// One read-modify-write for a domain's plist file, rendered binary
/// and written atomically: orphan removal and undo both edit through
/// here.
pub fn edit_domain(
    store: &std::path::Path,
    edit: impl FnOnce(&mut plist::Dictionary),
) -> Result<(), crate::error::Error> {
    let mut root = plist::Value::from_file(store)
        .ok()
        .and_then(plist::Value::into_dictionary)
        .unwrap_or_default();
    edit(&mut root);
    let mut rendered = Vec::new();
    plist::Value::Dictionary(root)
        .to_writer_binary(&mut rendered)
        .map_err(|error| crate::error::Error::apply("rendering the preference file", error))?;
    crate::util::write_atomic(store, &rendered, None, false)
        .map_err(|error| crate::error::Error::apply("writing the preference file", error))
}

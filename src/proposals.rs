//! Write-back: turning accepted findings into config edits.
//!
//! One matching logic serves the whole product: a proposal lands in
//! the module where similar declarations already live — matched by
//! provider for packages, by domain for preferences — and anything
//! that matches nowhere, or more than one place, lands in
//! `modules/inbox.luau`. An ambiguous match is an inbox match, never
//! a guess, and the inbox is a legitimate permanent home. `niwa add`
//! places its lines with exactly this logic, so there is one brain,
//! not two.

use std::collections::BTreeSet;
use std::path::PathBuf;

use crate::error::Error;
use crate::journal::{Acknowledgement, Journal, digest};
use crate::model::{Declaration, Kind, Unit, Value};
use crate::paths::Paths;

/// Where a new declaration should land: the one module that already
/// speaks its language, or the inbox.
pub fn place(declarations: &[Declaration], kind: &Kind, domain: Option<&str>) -> PathBuf {
    let mut homes: BTreeSet<String> = BTreeSet::new();
    for declaration in declarations {
        let Unit::Module(module) = &declaration.unit else {
            continue;
        };
        let fits = domain.map_or_else(
            || &declaration.identity.kind == kind,
            |domain| {
                matches!(declaration.identity.kind, Kind::Defaults)
                    && declaration
                        .identity
                        .key
                        .split_once(':')
                        .is_some_and(|(declared_domain, _)| declared_domain == domain)
            },
        );
        if fits {
            homes.insert(module.clone());
        }
    }
    let mut modules = homes.into_iter();
    match (modules.next(), modules.next()) {
        (Some(only), None) => PathBuf::from(format!("modules/{only}.luau")),
        _ => PathBuf::from("modules/inbox.luau"),
    }
}

/// Append a statement to a config file, creating the inbox on first
/// use and making sure init.luau actually loads it.
pub fn append(paths: &Paths, relative: &PathBuf, statement: &str) -> Result<(), Error> {
    let path = paths.config.join(relative);
    let is_inbox = relative.ends_with("inbox.luau");
    if !path.exists() {
        if !is_inbox {
            return Err(Error::Apply {
                doing: format!("appending to {}", relative.display()),
                detail: "the module file does not exist".to_string(),
            });
        }
        let header = "--!strict\n-- Staging: accepted proposals land here when no other module\n-- matches. Move lines out whenever you feel like it, or never.\nlocal niwa = require(\"@niwa\")\n";
        std::fs::create_dir_all(path.parent().unwrap_or(&paths.config))
            .map_err(|error| Error::apply("creating the modules directory", error))?;
        crate::util::write_atomic(&path, header.as_bytes(), None, false)
            .map_err(|error| Error::apply("creating the inbox", error))?;
        require_inbox(paths)?;
    }
    let mut text = std::fs::read_to_string(&path).map_err(|error| Error::Apply {
        doing: format!("reading {}", relative.display()),
        detail: error.to_string(),
    })?;
    if !text.ends_with('\n') {
        text.push('\n');
    }
    text.push('\n');
    text.push_str(statement);
    text.push('\n');
    crate::util::write_atomic(&path, text.as_bytes(), None, false).map_err(|error| Error::Apply {
        doing: format!("writing {}", relative.display()),
        detail: error.to_string(),
    })
}

/// A fresh inbox is only real once init.luau requires it. The require
/// goes above `niwa.host()` when there is one, so hosts still load
/// last.
fn require_inbox(paths: &Paths) -> Result<(), Error> {
    let init = paths.config.join("init.luau");
    let text =
        std::fs::read_to_string(&init).map_err(|error| Error::apply("reading init.luau", error))?;
    if text.contains("@self/modules/inbox") {
        return Ok(());
    }
    let line = "require(\"@self/modules/inbox\")\n";
    let updated = text.find("niwa.host()").map_or_else(
        || {
            let mut updated = text.clone();
            if !updated.ends_with('\n') {
                updated.push('\n');
            }
            updated.push_str(line);
            updated
        },
        |position| {
            let start = text[..position].rfind('\n').map_or(0, |index| index + 1);
            let mut updated = text.clone();
            updated.insert_str(start, line);
            updated
        },
    );
    crate::util::write_atomic(&init, updated.as_bytes(), None, false)
        .map_err(|error| Error::apply("writing init.luau", error))
}

/// Render a canonical value as Luau source, in the example config's
/// style.
pub fn luau_literal(value: &Value) -> String {
    match value {
        Value::Bool(flag) => flag.to_string(),
        Value::Int(number) => number.to_string(),
        Value::Float(number) => number.to_string(),
        Value::Str(text) => quote(text),
        Value::List(items) => {
            let rendered: Vec<String> = items.iter().map(luau_literal).collect();
            format!("{{ {} }}", rendered.join(", "))
        }
        Value::Map(map) => {
            let rendered: Vec<String> = map
                .iter()
                .map(|(key, value)| format!("{} = {}", field_name(key), luau_literal(value)))
                .collect();
            format!("{{ {} }}", rendered.join(", "))
        }
    }
}

fn quote(text: &str) -> String {
    let mut quoted = String::with_capacity(text.len() + 2);
    quoted.push('"');
    for character in text.chars() {
        match character {
            '"' => quoted.push_str("\\\""),
            '\\' => quoted.push_str("\\\\"),
            '\n' => quoted.push_str("\\n"),
            other => quoted.push(other),
        }
    }
    quoted.push('"');
    quoted
}

/// A map key as Luau writes it: bare when it is an identifier,
/// bracketed and quoted when it is not.
fn field_name(key: &str) -> String {
    let identifier = !key.is_empty()
        && !key
            .chars()
            .next()
            .is_some_and(|first| first.is_ascii_digit())
        && key
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '_');
    if identifier {
        key.to_string()
    } else {
        format!("[{}]", quote(key))
    }
}

/// The statement an accepted package proposal writes.
pub fn package_statement(kind: &Kind, name: &str) -> String {
    let call = match kind {
        Kind::BrewCask => "niwa.brew.cask",
        Kind::Npm => "niwa.npm.global",
        _ => "niwa.brew.formula",
    };
    format!("{call} {{ {} }}", quote(name))
}

/// The statement an accepted settings flip writes.
pub fn defaults_statement(domain: &str, key: &str, value: &Value) -> String {
    format!(
        "niwa.defaults({}, {{\n  {} = {},\n}})",
        quote(domain),
        field_name(key),
        luau_literal(value)
    )
}

/// Rewrite the value a declaration already owns, on the line that
/// owns it. Sugar fields translate back through the same table that
/// lowered them. `None` means the line could not be edited with
/// confidence — and a guess is worse than a hand edit.
pub fn edit_in_place(
    paths: &Paths,
    provenance: &crate::model::Provenance,
    key: &str,
    value: &Value,
) -> Option<()> {
    let path = paths.config.join(&provenance.file);
    let text = std::fs::read_to_string(&path).ok()?;
    let lines: Vec<&str> = text.lines().collect();
    let start = provenance.line.saturating_sub(1) as usize;

    // The declaration starts at its provenance line; the field may
    // sit a few lines below in a multi-line table.
    let (field, rendered) =
        sugar_form(key, value).unwrap_or_else(|| (field_name(key), luau_literal(value)));

    for offset in 0..12 {
        let index = start + offset;
        let Some(line) = lines.get(index) else {
            break;
        };
        if let Some(edited) = replace_field(line, &field, &rendered) {
            let mut updated: Vec<String> = lines.iter().map(ToString::to_string).collect();
            updated[index] = edited;
            let mut joined = updated.join("\n");
            joined.push('\n');
            crate::util::write_atomic(&path, joined.as_bytes(), None, false).ok()?;
            return Some(());
        }
    }
    None
}

/// `mineffect` reads back as `minimize_effect = "scale"`, and the
/// Finder view codes read back as their readable names, so an edited
/// sugar line stays sugar.
fn sugar_form(key: &str, value: &Value) -> Option<(String, String)> {
    let (field, rendered) = match key {
        "persistent-apps" => ("apps".to_string(), luau_literal(value)),
        "mineffect" => ("minimize_effect".to_string(), luau_literal(value)),
        "AppleShowAllFiles" => ("show_hidden".to_string(), luau_literal(value)),
        "_FXShowPosixPathInTitle" => ("path_in_title".to_string(), luau_literal(value)),
        "FXPreferredViewStyle" => {
            let Value::Str(code) = value else {
                return None;
            };
            let readable = match code.as_str() {
                "Nlsv" => "list",
                "icnv" => "icon",
                "clmv" => "column",
                "glyv" => "gallery",
                _ => return None,
            };
            ("default_view".to_string(), quote(readable))
        }
        _ => return None,
    };
    Some((field, rendered))
}

/// Replace `field = <old>` on one line, keeping everything around it.
fn replace_field(line: &str, field: &str, rendered: &str) -> Option<String> {
    let position = line.find(field)?;
    let after_field = &line[position + field.len()..];
    let equals = after_field.find('=')?;
    if !after_field[..equals].trim().is_empty() {
        return None;
    }
    let value_start = position + field.len() + equals + 1;
    let rest = &line[value_start..];
    // The value runs to the next comma or closing brace at depth zero.
    let mut depth = 0i32;
    let mut end = rest.len();
    let mut in_string = false;
    for (index, character) in rest.char_indices() {
        match character {
            '"' => in_string = !in_string,
            _ if in_string => {}
            '{' | '(' | '[' => depth += 1,
            '}' | ')' | ']' if depth > 0 => depth -= 1,
            '}' | ')' | ']' | ',' => {
                end = index;
                break;
            }
            _ => {}
        }
    }
    // The replacement keeps the spacing around the value exactly as
    // it was; only the value itself moves.
    let value_region = &rest[..end];
    let trailing = value_region.len() - value_region.trim_end().len();
    let mut edited = String::new();
    edited.push_str(&line[..value_start]);
    edited.push(' ');
    edited.push_str(rendered);
    edited.push_str(&rest[end - trailing..]);
    Some(edited)
}

/// Bring a live edit home: the target's bytes become the repo
/// source's bytes, and the journal acknowledges the new truth so all
/// three states agree again.
pub fn pull_file(
    paths: &Paths,
    journal: &mut Journal,
    target: &str,
    source: &str,
) -> Result<(), Error> {
    let rest = source.strip_prefix("@self/").ok_or_else(|| Error::Apply {
        doing: format!("pulling {target}"),
        detail: "the source is not a @self path".to_string(),
    })?;
    let live = std::fs::read(paths.expand_home(target)).map_err(|error| Error::Apply {
        doing: format!("reading {target}"),
        detail: error.to_string(),
    })?;
    let destination = paths.config.join(rest);
    crate::util::write_atomic(&destination, &live, None, false).map_err(|error| Error::Apply {
        doing: format!("writing {}", destination.display()),
        detail: error.to_string(),
    })?;
    let identity = format!("file:{target}");
    if let Some(ack) = journal.acknowledged(&identity) {
        let updated = Acknowledgement::new(ack.spec.clone(), Some(digest(&live)));
        journal.acknowledge(identity, updated);
    }
    Ok(())
}

/// Carry out an accepted orphan removal: reverse the resource, then
/// drop the acknowledgement. Files are archived first — nothing is
/// ever the only copy.
pub fn remove_orphan(paths: &Paths, journal: &mut Journal, identity: &str) -> Result<(), Error> {
    let archive_root = crate::apply::archive_dir(paths);
    let parsed = crate::model::Identity::parse(identity);
    let key = parsed.key.as_str();
    match &parsed.kind {
        Kind::File | Kind::Link => {
            let target = paths.expand_home(key);
            if let Ok(current) = std::fs::read(&target) {
                crate::apply::archive_bytes(&archive_root, identity, &current)?;
            }
            std::fs::remove_file(&target).map_err(|error| Error::Apply {
                doing: format!("removing {key}"),
                detail: error.to_string(),
            })?;
        }
        Kind::Defaults => {
            let Some((domain, preference)) = key.split_once(':') else {
                return Ok(());
            };
            let store = crate::defaults::domain_path(paths, domain);
            if let Ok(bytes) = std::fs::read(&store) {
                crate::apply::archive_bytes(&archive_root, identity, &bytes)?;
            }
            let mut root = plist::Value::from_file(&store)
                .ok()
                .and_then(plist::Value::into_dictionary)
                .unwrap_or_default();
            root.remove(preference);
            let mut rendered = Vec::new();
            plist::Value::Dictionary(root)
                .to_writer_binary(&mut rendered)
                .map_err(|error| Error::apply("rendering the preference file", error))?;
            crate::util::write_atomic(&store, &rendered, None, false)
                .map_err(|error| Error::apply("writing the preference file", error))?;
        }
        Kind::BrewFormula | Kind::BrewCask | Kind::Npm | Kind::Mise => {
            crate::apply::uninstall_package(&parsed)?;
        }
        Kind::Service => {
            crate::services::bootout(paths, key);
            let plist = crate::services::agent_plist(paths, key);
            if let Ok(bytes) = std::fs::read(&plist) {
                crate::apply::archive_bytes(&archive_root, identity, &bytes)?;
            }
            let _ = std::fs::remove_file(&plist);
        }
        Kind::BrewService => {
            crate::services::brew_service_stop(key).map_err(|detail| Error::Apply {
                doing: format!("stopping the {key} service"),
                detail,
            })?;
        }
        _ => {}
    }
    journal.drop_acknowledgement(identity);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn literals_render_in_the_example_style() {
        assert_eq!(luau_literal(&Value::Bool(false)), "false");
        assert_eq!(luau_literal(&Value::Int(48)), "48");
        assert_eq!(luau_literal(&Value::Str("scale".into())), "\"scale\"");
        assert_eq!(
            luau_literal(&Value::List(vec![
                Value::Str("fd".into()),
                Value::Str("jq".into())
            ])),
            "{ \"fd\", \"jq\" }"
        );
    }

    #[test]
    fn awkward_keys_are_bracketed_and_quoted() {
        let mut map = std::collections::BTreeMap::new();
        map.insert("disable-shadow".to_string(), Value::Bool(true));
        assert_eq!(
            luau_literal(&Value::Map(map)),
            "{ [\"disable-shadow\"] = true }"
        );
    }

    #[test]
    fn statements_read_like_the_example_config() {
        assert_eq!(
            package_statement(&Kind::BrewFormula, "htop"),
            "niwa.brew.formula { \"htop\" }"
        );
        assert_eq!(
            defaults_statement("com.apple.dock", "tilesize", &Value::Int(64)),
            "niwa.defaults(\"com.apple.dock\", {\n  tilesize = 64,\n})"
        );
    }

    #[test]
    fn a_field_edit_replaces_only_the_value() {
        assert_eq!(
            replace_field("  autohide = true,", "autohide", "false"),
            Some("  autohide = false,".to_string())
        );
        assert_eq!(
            replace_field(
                "niwa.dock { autohide = true, tilesize = 48 }",
                "tilesize",
                "64"
            ),
            Some("niwa.dock { autohide = true, tilesize = 64 }".to_string())
        );
        assert_eq!(replace_field("  apps = {},", "autohide", "false"), None);
    }

    #[test]
    fn finder_codes_read_back_as_their_names() {
        let (field, rendered) =
            sugar_form("FXPreferredViewStyle", &Value::Str("clmv".into())).unwrap();
        assert_eq!(field, "default_view");
        assert_eq!(rendered, "\"column\"");
    }
}

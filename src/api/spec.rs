//! Spec validation. Every error names the resource, the field, what
//! was expected, and what arrived, with the config source location up
//! front — the runtime half of the promise the shipped types make in
//! the editor.

use mlua::Table;

use crate::model::{Provenance, Value};

/// Validation context: which resource is being validated and where it
/// was declared.
pub struct SpecCtx<'a> {
    pub resource: &'a str,
    pub provenance: &'a Provenance,
}

impl SpecCtx<'_> {
    pub fn fail(&self, message: &str) -> mlua::Error {
        mlua::Error::RuntimeError(format!("{}: {}: {message}", self.provenance, self.resource))
    }

    /// Reject fields the resource does not know, naming the ones it
    /// does. Array entries (positional values) are left alone.
    pub fn no_unknown_fields(&self, table: &Table, known: &[&str]) -> mlua::Result<()> {
        for pair in table.pairs::<mlua::Value, mlua::Value>() {
            let (key, _) = pair?;
            if let mlua::Value::String(s) = key {
                let name = s.to_str().map(|s| s.to_string()).unwrap_or_default();
                if !known.contains(&name.as_str()) {
                    return Err(self.fail(&format!(
                        "unknown field `{name}`: known fields are {}",
                        known.join(", ")
                    )));
                }
            }
        }
        Ok(())
    }

    pub fn required_str(&self, table: &Table, field: &str) -> mlua::Result<String> {
        match table.get::<mlua::Value>(field)? {
            mlua::Value::String(s) => Ok(s.to_str()?.to_string()),
            mlua::Value::Nil => Err(self.fail(&format!("field `{field}` is required"))),
            other => Err(self.type_error(field, "a string", &other)),
        }
    }

    pub fn opt_str(&self, table: &Table, field: &str) -> mlua::Result<Option<String>> {
        match table.get::<mlua::Value>(field)? {
            mlua::Value::String(s) => Ok(Some(s.to_str()?.to_string())),
            mlua::Value::Nil => Ok(None),
            other => Err(self.type_error(field, "a string", &other)),
        }
    }

    pub fn opt_bool(&self, table: &Table, field: &str) -> mlua::Result<Option<bool>> {
        match table.get::<mlua::Value>(field)? {
            mlua::Value::Boolean(b) => Ok(Some(b)),
            mlua::Value::Nil => Ok(None),
            other => Err(self.type_error(field, "a boolean", &other)),
        }
    }

    pub fn opt_int(&self, table: &Table, field: &str) -> mlua::Result<Option<i64>> {
        match table.get::<mlua::Value>(field)? {
            mlua::Value::Nil => Ok(None),
            other => match Value::from_lua(&other) {
                Ok(Value::Int(i)) => Ok(Some(i)),
                _ => Err(self.type_error(field, "an integer", &other)),
            },
        }
    }

    /// A value field canonicalized through the model, for plist-shaped
    /// payloads.
    pub fn value(&self, field: &str, raw: &mlua::Value) -> mlua::Result<Value> {
        Value::from_lua(raw).map_err(|got| self.fail(&format!("field `{field}` cannot hold {got}")))
    }

    fn type_error(&self, field: &str, expected: &str, got: &mlua::Value) -> mlua::Error {
        self.fail(&format!(
            "field `{field}` expects {expected}, got {}",
            got.type_name()
        ))
    }
}

pub use crate::util::parse_duration;

/// `owner/repo`, exactly: two non-empty segments, one slash.
pub fn github_repo_ok(repo: &str) -> bool {
    let mut parts = repo.split('/');
    let owner_ok = parts.next().is_some_and(|p| !p.is_empty());
    let name_ok = parts.next().is_some_and(|p| !p.is_empty());
    owner_ok && name_ok && parts.next().is_none()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn malformed_durations_are_rejected() {
        for bad in ["", "5", "m", "5 m", "-5m", "5d", "1.5h"] {
            assert_eq!(parse_duration(bad), None, "{bad}");
        }
    }
}

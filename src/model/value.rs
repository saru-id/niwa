//! Canonical values. Specs and plist payloads live in one shape so
//! that identical declarations fold, differing ones conflict with a
//! readable diff, and the same recursive type covers everything
//! `defaults` can say.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

/// The recursive value type: booleans, numbers, strings, lists, and
/// string-keyed maps. Whole numbers canonicalize to integers so that
/// `48` and `48.0` are one value.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum Value {
    Bool(bool),
    Int(i64),
    Float(f64),
    Str(String),
    List(Vec<Self>),
    Map(BTreeMap<String, Self>),
}

impl Value {
    /// A stable, exact rendering for keys that must never drift:
    /// declined proposals are remembered under it, so it must not
    /// follow the screen renderer's formatting.
    pub fn canonical(&self) -> String {
        serde_json::to_string(self).unwrap_or_default()
    }

    /// Canonicalize a Lua value. Functions, userdata, threads, nil,
    /// non-finite numbers, and tables with mixed keys are rejected
    /// with a message naming what arrived.
    pub fn from_lua(value: &mlua::Value) -> Result<Self, String> {
        match value {
            mlua::Value::Boolean(b) => Ok(Self::Bool(*b)),
            mlua::Value::Integer(i) => Ok(Self::Int(*i)),
            mlua::Value::Number(n) => {
                if !n.is_finite() {
                    return Err("a number that is not finite".to_string());
                }
                #[allow(
                    clippy::cast_possible_truncation,
                    reason = "the fract check proves the cast is exact"
                )]
                if n.fract() == 0.0 && n.abs() < 9_007_199_254_740_992.0 {
                    Ok(Self::Int(*n as i64))
                } else {
                    Ok(Self::Float(*n))
                }
            }
            mlua::Value::String(s) => s.to_str().map_or_else(
                |_| Err("a string that is not valid UTF-8".to_string()),
                |s| Ok(Self::Str(s.to_string())),
            ),
            mlua::Value::Table(table) => Self::from_table(table),
            other => Err(format!("a {}", other.type_name())),
        }
    }

    fn from_table(table: &mlua::Table) -> Result<Self, String> {
        let mut entries: Vec<(mlua::Value, mlua::Value)> = Vec::new();
        for pair in table.pairs::<mlua::Value, mlua::Value>() {
            entries.push(pair.map_err(|e| e.to_string())?);
        }
        if entries.is_empty() {
            return Ok(Self::List(Vec::new()));
        }

        let len = i64::try_from(entries.len()).unwrap_or(i64::MAX);
        let is_array = entries
            .iter()
            .all(|(k, _)| matches!(k, mlua::Value::Integer(i) if (1..=len).contains(i)));
        if is_array {
            let mut items: Vec<(i64, Self)> = Vec::with_capacity(entries.len());
            for (key, value) in &entries {
                let mlua::Value::Integer(i) = key else {
                    unreachable!()
                };
                items.push((*i, Self::from_lua(value)?));
            }
            items.sort_by_key(|(i, _)| *i);
            return Ok(Self::List(items.into_iter().map(|(_, v)| v).collect()));
        }

        let all_strings = entries
            .iter()
            .all(|(k, _)| matches!(k, mlua::Value::String(_)));
        if all_strings {
            let mut map = BTreeMap::new();
            for (key, value) in &entries {
                let mlua::Value::String(s) = key else {
                    unreachable!()
                };
                let key = s
                    .to_str()
                    .map_err(|_| "a key that is not valid UTF-8".to_string())?
                    .to_string();
                map.insert(key, Self::from_lua(value)?);
            }
            return Ok(Self::Map(map));
        }

        Err("a table that mixes list entries and named fields".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lua_eval(source: &str) -> Value {
        let lua = mlua::Lua::new();
        let value: mlua::Value = lua.load(source).eval().unwrap();
        Value::from_lua(&value).unwrap()
    }

    fn lua_eval_err(source: &str) -> String {
        let lua = mlua::Lua::new();
        let value: mlua::Value = lua.load(source).eval().unwrap();
        Value::from_lua(&value).unwrap_err()
    }

    #[test]
    fn whole_numbers_canonicalize_to_integers() {
        assert_eq!(lua_eval("48"), Value::Int(48));
        assert_eq!(lua_eval("48.0"), Value::Int(48));
        assert_eq!(lua_eval("2.5"), Value::Float(2.5));
    }

    #[test]
    fn arrays_and_maps_keep_their_shapes() {
        assert_eq!(
            lua_eval("{1, 2, 3}"),
            Value::List(vec![Value::Int(1), Value::Int(2), Value::Int(3)])
        );
        let Value::Map(map) = lua_eval("{ a = true, b = \"x\" }") else {
            panic!("expected a map");
        };
        assert_eq!(map.get("a"), Some(&Value::Bool(true)));
        assert_eq!(map.get("b"), Some(&Value::Str("x".to_string())));
    }

    #[test]
    fn an_empty_table_reads_as_an_empty_list() {
        assert_eq!(lua_eval("{}"), Value::List(Vec::new()));
    }

    #[test]
    fn nested_structures_canonicalize_recursively() {
        let Value::Map(map) = lua_eval("{ list = { { deep = 1 } } }") else {
            panic!("expected a map");
        };
        let Some(Value::List(items)) = map.get("list") else {
            panic!("expected a list");
        };
        assert!(matches!(items[0], Value::Map(_)));
    }

    #[test]
    fn functions_mixed_tables_and_nan_are_rejected() {
        assert!(lua_eval_err("function() end").contains("function"));
        assert!(lua_eval_err("{ 1, a = 2 }").contains("mixes"));
        assert!(lua_eval_err("0 / 0").contains("finite"));
    }
}

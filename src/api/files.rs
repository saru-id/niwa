//! `niwa.file` and `niwa.link`.
//!
//! Files are copied, links are for directories you develop in. A
//! directory source fans out to one file resource per file, each with
//! its own identity, so drift, pull, and undo stay per file.

use mlua::{Lua, Table};

use crate::model::{Declaration, Identity, Kind, Value};

use super::spec::SpecCtx;
use super::{Ctx, aggregate, provenance, result_table, settle, settle_truth, unit_of};

pub fn register(lua: &Lua, niwa: &Table, ctx: &Ctx) -> mlua::Result<()> {
    let file_ctx = ctx.clone();
    let file = lua.create_function(move |lua, (target, options): (String, Table)| {
        declare_file(lua, &file_ctx, &target, &options)
    })?;
    niwa.set("file", file)?;

    let link_ctx = ctx.clone();
    let link = lua.create_function(move |lua, (target, options): (String, Table)| {
        declare_link(lua, &link_ctx, &target, &options)
    })?;
    niwa.set("link", link)?;

    Ok(())
}

fn declare_file(lua: &Lua, ctx: &Ctx, target: &str, options: &Table) -> mlua::Result<Table> {
    let prov = provenance(lua);
    let spec = SpecCtx {
        resource: "niwa.file",
        provenance: &prov,
    };
    spec.no_unknown_fields(options, &["source", "content", "mode"])?;

    if ctx.target_path(target).is_none() {
        return Err(spec.fail(&format!(
            "target `{target}` must start with `~/` or be an absolute path"
        )));
    }

    let source = spec.opt_str(options, "source")?;
    let content = content_field(&spec, options)?;
    let mode = mode_field(&spec, options)?;

    let mut fields = std::collections::BTreeMap::new();
    if let Some(mode) = mode {
        fields.insert("mode".to_string(), Value::Int(mode));
    }

    match (source, content) {
        (Some(source), None) => {
            let Some(source_path) = ctx.self_path(&source) else {
                return Err(spec.fail(&format!(
                    "source `{source}` must be a `@self/` path: sources live in your config repo"
                )));
            };
            if source_path.is_dir() {
                return fan_out(lua, ctx, &spec, target, &source, &fields);
            }
            fields.insert("source".to_string(), Value::Str(source));
            settle(lua, ctx, &declaration(&prov, target, fields))
        }
        (None, Some(content)) => {
            fields.insert("content".to_string(), content);
            settle(lua, ctx, &declaration(&prov, target, fields))
        }
        (Some(_), Some(_)) => Err(spec.fail("declare `source` or `content`, not both")),
        (None, None) => Err(spec.fail("declare one of `source` or `content`")),
    }
}

/// `content` accepts a plain string or a `niwa.render` handle. A
/// rendered spec stores the template and the names of its inputs;
/// secret values never enter a spec.
fn content_field(spec: &SpecCtx<'_>, options: &Table) -> mlua::Result<Option<Value>> {
    match options.get::<mlua::Value>("content")? {
        mlua::Value::Nil => Ok(None),
        mlua::Value::String(s) => Ok(Some(Value::Str(s.to_str()?.to_string()))),
        mlua::Value::Table(table) => super::values::render_to_value(&table).map_or_else(
            || Err(spec.fail("field `content` expects a string or a value from niwa.render")),
            |value| Ok(Some(value)),
        ),
        other => Err(spec.fail(&format!(
            "field `content` expects a string or a value from niwa.render, got {}",
            other.type_name()
        ))),
    }
}

/// `mode` is a string of octal digits, `mode = "600"`. Luau has no
/// octal literals, and a decimal integer where octal was meant is the
/// classic permissions bug, so integers are rejected by name.
fn mode_field(spec: &SpecCtx<'_>, options: &Table) -> mlua::Result<Option<i64>> {
    match options.get::<mlua::Value>("mode")? {
        mlua::Value::Nil => Ok(None),
        mlua::Value::String(s) => {
            let text = s.to_str()?.to_string();
            let valid = (1..=4).contains(&text.len())
                && text.chars().all(|c| ('0'..='7').contains(&c));
            if !valid {
                return Err(spec.fail(&format!(
                    "field `mode` expects octal digits like \"600\", got \"{text}\""
                )));
            }
            i64::from_str_radix(&text, 8)
                .map(Some)
                .map_err(|_| spec.fail("field `mode` does not parse as octal"))
        }
        mlua::Value::Integer(_) | mlua::Value::Number(_) => Err(spec.fail(
            "field `mode` expects a string of octal digits, for example \"600\": Luau numbers have no octal form, and a decimal here would set the wrong bits",
        )),
        other => Err(spec.fail(&format!(
            "field `mode` expects a string of octal digits, got {}",
            other.type_name()
        ))),
    }
}

/// A directory source lowers to one file resource per file inside it,
/// in sorted order so runs are deterministic.
fn fan_out(
    lua: &Lua,
    ctx: &Ctx,
    spec: &SpecCtx<'_>,
    target: &str,
    source: &str,
    shared_fields: &std::collections::BTreeMap<String, Value>,
) -> mlua::Result<Table> {
    let Some(source_root) = ctx.self_path(source) else {
        return Err(spec.fail("source escaped the config repo"));
    };
    let mut relatives = Vec::new();
    collect_files(&source_root, "", &mut relatives)
        .map_err(|error| spec.fail(&format!("cannot read source `{source}`: {error}")))?;
    relatives.sort();

    let target_base = target.trim_end_matches('/');
    let source_base = source.trim_end_matches('/');
    let mut truths = Vec::new();
    for rel in relatives {
        let mut fields = shared_fields.clone();
        fields.insert(
            "source".to_string(),
            Value::Str(format!("{source_base}/{rel}")),
        );
        let declared = declaration(spec.provenance, &format!("{target_base}/{rel}"), fields);
        if let Some(truth) = settle_truth(ctx, &declared)? {
            truths.push(truth);
        }
    }
    result_table(lua, ctx, &aggregate(&truths))
}

fn collect_files(
    dir: &std::path::Path,
    prefix: &str,
    out: &mut Vec<String>,
) -> std::io::Result<()> {
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        let rel = if prefix.is_empty() {
            name
        } else {
            format!("{prefix}/{name}")
        };
        if entry.file_type()?.is_dir() {
            collect_files(&entry.path(), &rel, out)?;
        } else {
            out.push(rel);
        }
    }
    Ok(())
}

fn declaration(
    prov: &crate::model::Provenance,
    target: &str,
    fields: std::collections::BTreeMap<String, Value>,
) -> Declaration {
    Declaration {
        identity: Identity::new(Kind::File, target),
        spec: Value::Map(fields),
        provenance: prov.clone(),
        unit: unit_of(prov),
        privileged: false,
    }
}

fn declare_link(lua: &Lua, ctx: &Ctx, target: &str, options: &Table) -> mlua::Result<Table> {
    let prov = provenance(lua);
    let spec = SpecCtx {
        resource: "niwa.link",
        provenance: &prov,
    };
    spec.no_unknown_fields(options, &["to"])?;

    if ctx.target_path(target).is_none() {
        return Err(spec.fail(&format!(
            "target `{target}` must start with `~/` or be an absolute path"
        )));
    }
    let to = spec.required_str(options, "to")?;
    if ctx.self_path(&to).is_none() {
        return Err(
            spec.fail("field `to` must be a `@self/` path: links point into your config repo")
        );
    }

    let mut fields = std::collections::BTreeMap::new();
    fields.insert("to".to_string(), Value::Str(to));
    settle(
        lua,
        ctx,
        &Declaration {
            identity: Identity::new(Kind::Link, target),
            spec: Value::Map(fields),
            provenance: prov.clone(),
            unit: unit_of(&prov),
            privileged: false,
        },
    )
}

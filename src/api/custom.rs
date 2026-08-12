//! `niwa.resource`: kinds the config defines itself.
//!
//! `check` receives a read-only handle and `apply` receives an acting
//! one — enforced by construction when the engine lands. `reverse` is
//! part of the contract: a kind that genuinely cannot be reversed says
//! so with `reverse = false`, and the journal will mark it
//! irreversible.

use mlua::{Function, Lua, Table};

use crate::model::{Declaration, Identity, Kind};

use super::spec::SpecCtx;
use super::{Ctx, provenance, settle, unit_of};

pub fn register(lua: &Lua, niwa: &Table, ctx: &Ctx) -> mlua::Result<()> {
    let resource_ctx = ctx.clone();
    niwa.set(
        "resource",
        lua.create_function(move |lua, (kind, def): (String, Table)| {
            define_kind(lua, &resource_ctx, &kind, &def)
        })?,
    )?;
    Ok(())
}

fn define_kind(lua: &Lua, ctx: &Ctx, kind: &str, def: &Table) -> mlua::Result<Function> {
    let prov = provenance(lua);
    let spec = SpecCtx {
        resource: "niwa.resource",
        provenance: &prov,
    };

    let valid = !kind.is_empty()
        && kind
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '.' || c == '_')
        && !kind.starts_with('.')
        && !kind.ends_with('.');
    if !valid {
        return Err(spec.fail(&format!(
            "`{kind}` is not a kind name: use lowercase words joined by dots, like \"dotnet.tool\""
        )));
    }
    if Kind::RESERVED.contains(&kind) {
        return Err(spec.fail(&format!("`{kind}` is a built-in kind")));
    }

    spec.no_unknown_fields(
        def,
        &["check", "apply", "reverse", "describe", "privileged"],
    )?;
    // The handlers are validated now and driven by the engine when it
    // lands; until then, holding them would be storage nothing reads.
    let _: Function = handler(&spec, def, "check")?;
    let _: Function = handler(&spec, def, "apply")?;
    let _: Function = handler(&spec, def, "describe")?;
    match def.get::<mlua::Value>("reverse")? {
        mlua::Value::Function(_) | mlua::Value::Boolean(false) => {}
        mlua::Value::Nil => {
            return Err(spec.fail(
                "`reverse` is part of the contract: give a function, or say `reverse = false` to mark the kind irreversible",
            ));
        }
        other => {
            return Err(spec.fail(&format!(
                "field `reverse` expects a function or `false`, got {}",
                other.type_name()
            )));
        }
    }
    let privileged = spec.opt_bool(def, "privileged")?.unwrap_or(false);

    if !ctx.state.borrow_mut().custom_kinds.insert(kind.to_string()) {
        return Err(spec.fail(&format!("kind `{kind}` is already defined")));
    }

    let declare_ctx = ctx.clone();
    let kind_name = kind.to_string();
    lua.create_function(move |lua, resource_spec: Table| {
        declare_custom(lua, &declare_ctx, &kind_name, &resource_spec, privileged)
    })
}

fn handler(spec: &SpecCtx<'_>, def: &Table, field: &str) -> mlua::Result<Function> {
    match def.get::<mlua::Value>(field)? {
        mlua::Value::Function(f) => Ok(f),
        mlua::Value::Nil => Err(spec.fail(&format!("field `{field}` is required"))),
        other => Err(spec.fail(&format!(
            "field `{field}` expects a function, got {}",
            other.type_name()
        ))),
    }
}

fn declare_custom(
    lua: &Lua,
    ctx: &Ctx,
    kind: &str,
    resource_spec: &Table,
    privileged: bool,
) -> mlua::Result<Table> {
    let prov = provenance(lua);
    let spec = SpecCtx {
        resource: kind,
        provenance: &prov,
    };
    let name = spec.required_str(resource_spec, "name")?;
    if name.is_empty() {
        return Err(spec.fail("field `name` cannot be empty"));
    }
    let canonical = spec.value("spec", &mlua::Value::Table(resource_spec.clone()))?;

    settle(
        lua,
        ctx,
        &Declaration {
            identity: Identity::new(Kind::Custom(kind.to_string()), name),
            spec: canonical,
            provenance: prov.clone(),
            unit: unit_of(&prov),
            privileged,
        },
    )
}

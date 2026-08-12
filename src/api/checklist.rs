//! The checklist: `niwa.permission` and `niwa.manual`.
//!
//! TCC grants and sign-ins cannot be automated, and niwa does not
//! pretend. These declare steps for a human, with deep links where one
//! exists. They never block an apply.

use std::collections::BTreeMap;

use mlua::{Lua, Table};

use crate::model::{Declaration, Identity, Kind, Value};

use super::spec::SpecCtx;
use super::{Ctx, provenance, stub_result, unit_of};

pub fn register(lua: &Lua, niwa: &Table, ctx: &Ctx) -> mlua::Result<()> {
    let permission_ctx = ctx.clone();
    niwa.set(
        "permission",
        lua.create_function(move |lua, options: Table| {
            declare_permission(lua, &permission_ctx, &options)
        })?,
    )?;

    let manual_ctx = ctx.clone();
    niwa.set(
        "manual",
        lua.create_function(move |lua, options: Table| declare_manual(lua, &manual_ctx, &options))?,
    )?;

    Ok(())
}

fn declare_permission(lua: &Lua, ctx: &Ctx, options: &Table) -> mlua::Result<Table> {
    let prov = provenance(lua);
    let spec = SpecCtx {
        resource: "niwa.permission",
        provenance: &prov,
    };
    spec.no_unknown_fields(options, &["app", "needs"])?;
    let app = spec.required_str(options, "app")?;
    let needs = spec.required_str(options, "needs")?;
    if app.is_empty() || needs.is_empty() {
        return Err(spec.fail("`app` and `needs` cannot be empty"));
    }

    let mut fields = BTreeMap::new();
    fields.insert("app".to_string(), Value::Str(app.clone()));
    fields.insert("needs".to_string(), Value::Str(needs.clone()));
    ctx.record(Declaration {
        identity: Identity::new(Kind::Permission, format!("{app}:{needs}")),
        spec: Value::Map(fields),
        provenance: prov.clone(),
        unit: unit_of(&prov),
        privileged: false,
    });
    stub_result(lua)
}

/// `niwa.manual { "Sign in to X", open = … }`. A step's identity is
/// its text, so rewording one re-arms it — which is what you want when
/// the instructions change.
fn declare_manual(lua: &Lua, ctx: &Ctx, options: &Table) -> mlua::Result<Table> {
    let prov = provenance(lua);
    let spec = SpecCtx {
        resource: "niwa.manual",
        provenance: &prov,
    };
    spec.no_unknown_fields(options, &["open", "command"])?;
    let text = match options.get::<mlua::Value>(1)? {
        mlua::Value::String(s) => s.to_str()?.to_string(),
        _ => {
            return Err(spec.fail(
                "the first entry is the step's text, for example { \"Sign in to Tailscale\", open = … }",
            ));
        }
    };
    if text.is_empty() {
        return Err(spec.fail("the step's text cannot be empty"));
    }

    let mut fields = BTreeMap::new();
    if let Some(open) = spec.opt_str(options, "open")? {
        fields.insert("open".to_string(), Value::Str(open));
    }
    if let Some(command) = spec.opt_str(options, "command")? {
        fields.insert("command".to_string(), Value::Str(command));
    }
    ctx.record(Declaration {
        identity: Identity::new(Kind::Manual, text),
        spec: Value::Map(fields),
        provenance: prov.clone(),
        unit: unit_of(&prov),
        privileged: false,
    });
    stub_result(lua)
}

//! The two files nobody owns, plus the machine's name.
//!
//! `/etc/hosts` and `/etc/shells` are shared with everything else on
//! the machine, so they get per-entry declarations instead of whole
//! file ownership. `hostname` and `login_shell` need administrator
//! rights and say so up front.

use std::collections::BTreeMap;

use mlua::{Lua, Table};

use crate::model::{Declaration, Identity, Kind, Value};

use super::spec::SpecCtx;
use super::{Ctx, aggregate, provenance, result_table, settle, settle_truth, unit_of};

pub fn register(lua: &Lua, niwa: &Table, ctx: &Ctx) -> mlua::Result<()> {
    let hosts_ctx = ctx.clone();
    niwa.set(
        "hosts",
        lua.create_function(move |lua, entries: Table| declare_hosts(lua, &hosts_ctx, &entries))?,
    )?;

    let shell_ctx = ctx.clone();
    niwa.set(
        "login_shell",
        lua.create_function(move |lua, path: String| declare_login_shell(lua, &shell_ctx, &path))?,
    )?;

    let hostname_ctx = ctx.clone();
    niwa.set(
        "hostname",
        lua.create_function(move |lua, name: String| declare_hostname(lua, &hostname_ctx, &name))?,
    )?;

    Ok(())
}

/// `niwa.hosts { ["dev.test"] = "127.0.0.1" }`: one declaration per
/// entry, so drift, conflicts, and undo work line by line.
fn declare_hosts(lua: &Lua, ctx: &Ctx, entries: &Table) -> mlua::Result<Table> {
    let prov = provenance(lua);
    let spec = SpecCtx {
        resource: "niwa.hosts",
        provenance: &prov,
    };
    let mut any = false;
    let mut truths = Vec::new();
    for pair in entries.pairs::<mlua::Value, mlua::Value>() {
        let (host, address) = pair?;
        let (mlua::Value::String(host), mlua::Value::String(address)) = (&host, &address) else {
            return Err(spec.fail(
                "keys are host names, values are addresses, for example { [\"dev.test\"] = \"127.0.0.1\" }",
            ));
        };
        let host = host.to_str()?.to_string();
        let address = address.to_str()?.to_string();
        if host.is_empty() || address.is_empty() {
            return Err(spec.fail("host names and addresses cannot be empty"));
        }
        let mut fields = BTreeMap::new();
        fields.insert("address".to_string(), Value::Str(address));
        if let Some(truth) = settle_truth(
            ctx,
            &Declaration {
                identity: Identity::new(Kind::Hosts, host),
                spec: Value::Map(fields),
                provenance: prov.clone(),
                unit: unit_of(&prov),
                privileged: true,
            },
        )? {
            truths.push(truth);
        }
        any = true;
    }
    if !any {
        return Err(spec.fail("declare at least one entry"));
    }
    result_table(lua, &aggregate(&truths))
}

/// `/etc/shells` entry plus `chsh`: two privileged steps that always
/// travel together. One login shell per machine, so the identity is a
/// singleton and two declarations conflict.
fn declare_login_shell(lua: &Lua, ctx: &Ctx, path: &str) -> mlua::Result<Table> {
    let prov = provenance(lua);
    let spec = SpecCtx {
        resource: "niwa.login_shell",
        provenance: &prov,
    };
    if !path.starts_with('/') {
        return Err(spec.fail(&format!(
            "expects an absolute path to the shell, got \"{path}\""
        )));
    }
    let mut fields = BTreeMap::new();
    fields.insert("path".to_string(), Value::Str(path.to_string()));
    settle(
        lua,
        ctx,
        &Declaration {
            identity: Identity::new(Kind::LoginShell, ""),
            spec: Value::Map(fields),
            provenance: prov.clone(),
            unit: unit_of(&prov),
            privileged: true,
        },
    )
}

fn declare_hostname(lua: &Lua, ctx: &Ctx, name: &str) -> mlua::Result<Table> {
    let prov = provenance(lua);
    let spec = SpecCtx {
        resource: "niwa.hostname",
        provenance: &prov,
    };
    if name.is_empty() || name.chars().any(char::is_whitespace) {
        return Err(spec.fail(&format!("`{name}` is not a host name")));
    }
    let mut fields = BTreeMap::new();
    fields.insert("name".to_string(), Value::Str(name.to_string()));
    settle(
        lua,
        ctx,
        &Declaration {
            identity: Identity::new(Kind::Hostname, ""),
            spec: Value::Map(fields),
            provenance: prov.clone(),
            unit: unit_of(&prov),
            privileged: true,
        },
    )
}

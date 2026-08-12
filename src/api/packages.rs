//! The package surface: `niwa.brew.*`, `niwa.mas.app`,
//! `niwa.npm.global`, `niwa.mise.tool`, `niwa.github_release`.
//!
//! Everything here is a validating stub for now: identities and specs
//! are real, providers read receipts in a later milestone.

use std::collections::BTreeMap;

use mlua::{Lua, Table};

use crate::model::{Declaration, Identity, Kind, Provenance, Value};

use super::spec::SpecCtx;
use super::{Ctx, aggregate, freeze, provenance, result_table, settle, settle_truth, unit_of};

pub fn register(lua: &Lua, niwa: &Table, ctx: &Ctx, brew_prefix: &str) -> mlua::Result<()> {
    let brew = lua.create_table()?;
    brew.set("prefix", brew_prefix)?;

    let formula_ctx = ctx.clone();
    brew.set(
        "formula",
        lua.create_function(move |lua, arg: mlua::Value| {
            declare_names(
                lua,
                &formula_ctx,
                "niwa.brew.formula",
                Kind::BrewFormula,
                &arg,
            )
        })?,
    )?;

    let cask_ctx = ctx.clone();
    brew.set(
        "cask",
        lua.create_function(move |lua, arg: mlua::Value| {
            declare_names(lua, &cask_ctx, "niwa.brew.cask", Kind::BrewCask, &arg)
        })?,
    )?;

    let service_ctx = ctx.clone();
    brew.set(
        "service",
        lua.create_function(move |lua, arg: mlua::Value| {
            declare_brew_services(lua, &service_ctx, &arg)
        })?,
    )?;

    freeze(lua, &brew)?;
    niwa.set("brew", brew)?;

    let mas = lua.create_table()?;
    let mas_ctx = ctx.clone();
    mas.set(
        "app",
        lua.create_function(move |lua, apps: Table| declare_mas(lua, &mas_ctx, &apps))?,
    )?;
    freeze(lua, &mas)?;
    niwa.set("mas", mas)?;

    let npm = lua.create_table()?;
    let npm_ctx = ctx.clone();
    npm.set(
        "global",
        lua.create_function(move |lua, arg: mlua::Value| {
            declare_names(lua, &npm_ctx, "niwa.npm.global", Kind::Npm, &arg)
        })?,
    )?;
    freeze(lua, &npm)?;
    niwa.set("npm", npm)?;

    let mise = lua.create_table()?;
    let mise_ctx = ctx.clone();
    mise.set(
        "tool",
        lua.create_function(move |lua, tools: Table| declare_mise(lua, &mise_ctx, &tools))?,
    )?;
    freeze(lua, &mise)?;
    niwa.set("mise", mise)?;

    let release_ctx = ctx.clone();
    niwa.set(
        "github_release",
        lua.create_function(move |lua, options: Table| {
            declare_github_release(lua, &release_ctx, &options)
        })?,
    )?;

    Ok(())
}

/// The three shapes a package call accepts: one name, a list of names,
/// or a table with `name` and options.
enum Names {
    One { name: String, optional: bool },
    Many(Vec<String>),
}

fn parse_names(spec: &SpecCtx<'_>, arg: &mlua::Value) -> mlua::Result<Names> {
    match arg {
        mlua::Value::String(s) => Ok(Names::One {
            name: checked_name(spec, &s.to_str()?)?,
            optional: false,
        }),
        mlua::Value::Table(table) => {
            if table.contains_key("name")? {
                spec.no_unknown_fields(table, &["name", "optional"])?;
                return Ok(Names::One {
                    name: checked_name(spec, &spec.required_str(table, "name")?)?,
                    optional: spec.opt_bool(table, "optional")?.unwrap_or(false),
                });
            }
            let mut names = Vec::new();
            for entry in table.clone().sequence_values::<mlua::Value>() {
                match entry? {
                    mlua::Value::String(s) => names.push(checked_name(spec, &s.to_str()?)?),
                    other => {
                        return Err(spec.fail(&format!(
                            "list entries are names; to pass options, declare one at a time with a `name` field (got {})",
                            other.type_name()
                        )));
                    }
                }
            }
            if names.is_empty() {
                return Err(spec.fail("declare at least one name"));
            }
            Ok(Names::Many(names))
        }
        other => Err(spec.fail(&format!(
            "expects a name, a list of names, or a table with a `name` field, got {}",
            other.type_name()
        ))),
    }
}

fn checked_name(spec: &SpecCtx<'_>, name: &str) -> mlua::Result<String> {
    if name.is_empty() || name.chars().any(char::is_whitespace) {
        return Err(spec.fail(&format!("`{name}` is not a package name")));
    }
    Ok(name.to_string())
}

/// Declare one identity per name. One name returns one result; a list
/// returns a list of results in the same order.
fn declare_names(
    lua: &Lua,
    ctx: &Ctx,
    resource: &str,
    kind: Kind,
    arg: &mlua::Value,
) -> mlua::Result<mlua::Value> {
    let prov = provenance(lua);
    let spec = SpecCtx {
        resource,
        provenance: &prov,
    };
    match parse_names(&spec, arg)? {
        Names::One { name, optional } => {
            let declared = package(&prov, kind, &name, optional);
            Ok(mlua::Value::Table(settle(lua, ctx, &declared)?))
        }
        Names::Many(names) => {
            let results = lua.create_table()?;
            for (index, name) in names.iter().enumerate() {
                let declared = package(&prov, kind.clone(), name, false);
                results.set(index + 1, settle(lua, ctx, &declared)?)?;
            }
            freeze(lua, &results)?;
            Ok(mlua::Value::Table(results))
        }
    }
}

fn package(prov: &Provenance, kind: Kind, name: &str, optional: bool) -> Declaration {
    let mut fields = BTreeMap::new();
    if optional {
        fields.insert("optional".to_string(), Value::Bool(true));
    }
    Declaration {
        identity: Identity::new(kind, name),
        spec: Value::Map(fields),
        provenance: prov.clone(),
        unit: unit_of(prov),
        privileged: false,
    }
}

/// `niwa.brew.service` declares the service and implies the formula,
/// so "postgres runs here" is one line.
fn declare_brew_services(lua: &Lua, ctx: &Ctx, arg: &mlua::Value) -> mlua::Result<mlua::Value> {
    let prov = provenance(lua);
    let spec = SpecCtx {
        resource: "niwa.brew.service",
        provenance: &prov,
    };
    let names = match parse_names(&spec, arg)? {
        Names::One { name, optional } => {
            if optional {
                return Err(
                    spec.fail("services are not optional: declare the formula optional instead")
                );
            }
            vec![name]
        }
        Names::Many(names) => names,
    };
    let mut truths = Vec::new();
    for name in &names {
        // The formula joins the batch; the service settles on its own
        // terms once its provider lands.
        settle_truth(ctx, &package(&prov, Kind::BrewFormula, name, false))?;
        if let Some(truth) = settle_truth(ctx, &package(&prov, Kind::BrewService, name, false))? {
            truths.push(truth);
        }
    }
    result_table(lua, &aggregate(&truths)).map(mlua::Value::Table)
}

/// `niwa.mas.app { ["Things 3"] = 904280696 }`: the App Store id is
/// the identity, the name is for humans.
fn declare_mas(lua: &Lua, ctx: &Ctx, apps: &Table) -> mlua::Result<Table> {
    let prov = provenance(lua);
    let spec = SpecCtx {
        resource: "niwa.mas.app",
        provenance: &prov,
    };
    let mut any = false;
    let mut truths = Vec::new();
    for pair in apps.pairs::<mlua::Value, mlua::Value>() {
        let (name, id) = pair?;
        let mlua::Value::String(name) = name else {
            return Err(spec.fail("keys are app names, values are App Store ids"));
        };
        let name = name.to_str()?.to_string();
        let id = match Value::from_lua(&id) {
            Ok(Value::Int(id)) if id > 0 => id,
            _ => {
                return Err(spec.fail(&format!(
                    "`{name}` needs a numeric App Store id, for example 904280696"
                )));
            }
        };
        let mut fields = BTreeMap::new();
        fields.insert("name".to_string(), Value::Str(name));
        if let Some(truth) = settle_truth(
            ctx,
            &Declaration {
                identity: Identity::new(Kind::Mas, id.to_string()),
                spec: Value::Map(fields),
                provenance: prov.clone(),
                unit: unit_of(&prov),
                privileged: false,
            },
        )? {
            truths.push(truth);
        }
        any = true;
    }
    if !any {
        return Err(spec.fail("declare at least one app"));
    }
    result_table(lua, &aggregate(&truths))
}

/// `niwa.mise.tool { node = "lts" }`: versions pin in niwa.lock when
/// the lockfile lands.
fn declare_mise(lua: &Lua, ctx: &Ctx, tools: &Table) -> mlua::Result<Table> {
    let prov = provenance(lua);
    let spec = SpecCtx {
        resource: "niwa.mise.tool",
        provenance: &prov,
    };
    let mut any = false;
    let mut truths = Vec::new();
    for pair in tools.pairs::<mlua::Value, mlua::Value>() {
        let (tool, version) = pair?;
        let (mlua::Value::String(tool), mlua::Value::String(version)) = (&tool, &version) else {
            return Err(spec.fail(
                "keys are tool names, values are version strings, for example { node = \"lts\" }",
            ));
        };
        let mut fields = BTreeMap::new();
        fields.insert(
            "version".to_string(),
            Value::Str(version.to_str()?.to_string()),
        );
        if let Some(truth) = settle_truth(
            ctx,
            &Declaration {
                identity: Identity::new(Kind::Mise, tool.to_str()?.to_string()),
                spec: Value::Map(fields),
                provenance: prov.clone(),
                unit: unit_of(&prov),
                privileged: false,
            },
        )? {
            truths.push(truth);
        }
        any = true;
    }
    if !any {
        return Err(spec.fail("declare at least one tool"));
    }
    result_table(lua, &aggregate(&truths))
}

fn declare_github_release(lua: &Lua, ctx: &Ctx, options: &Table) -> mlua::Result<Table> {
    let prov = provenance(lua);
    let spec = SpecCtx {
        resource: "niwa.github_release",
        provenance: &prov,
    };
    spec.no_unknown_fields(options, &["repo", "bin"])?;
    let repo = spec.required_str(options, "repo")?;
    let mut parts = repo.split('/');
    let owner_ok = parts.next().is_some_and(|p| !p.is_empty());
    let name_ok = parts.next().is_some_and(|p| !p.is_empty());
    if !(owner_ok && name_ok && parts.next().is_none()) {
        return Err(spec.fail(&format!(
            "field `repo` expects \"owner/name\", got \"{repo}\""
        )));
    }
    let mut fields = BTreeMap::new();
    if let Some(bin) = spec.opt_str(options, "bin")? {
        fields.insert("bin".to_string(), Value::Str(bin));
    }
    settle(
        lua,
        ctx,
        &Declaration {
            identity: Identity::new(Kind::GithubRelease, repo),
            spec: Value::Map(fields),
            provenance: prov.clone(),
            unit: unit_of(&prov),
            privileged: false,
        },
    )
}

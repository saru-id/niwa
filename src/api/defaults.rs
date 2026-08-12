//! `niwa.defaults` and the sugar that lowers to it.
//!
//! Sugar and the generic form produce the same identities, so a
//! `niwa.dock` in one module and a raw `niwa.defaults("com.apple.dock", …)`
//! in another meet in conflict detection no matter how they were
//! spelled. Domains under `/Library` need administrator rights.

use std::collections::BTreeMap;

use mlua::{Lua, Table};

use crate::model::{Declaration, Identity, Kind, Provenance, Value};

use super::spec::SpecCtx;
use super::{Ctx, aggregate, provenance, result_table, settle_truth, unit_of};

pub fn register(lua: &Lua, niwa: &Table, ctx: &Ctx) -> mlua::Result<()> {
    let defaults_ctx = ctx.clone();
    let defaults = lua.create_function(
        move |lua, (domain, values, options): (String, Table, Option<Table>)| {
            declare_defaults(lua, &defaults_ctx, &domain, &values, options.as_ref())
        },
    )?;
    niwa.set("defaults", defaults)?;

    let dock_ctx = ctx.clone();
    let dock =
        lua.create_function(move |lua, settings: Table| declare_dock(lua, &dock_ctx, &settings))?;
    niwa.set("dock", dock)?;

    let finder_ctx = ctx.clone();
    let finder = lua
        .create_function(move |lua, settings: Table| declare_finder(lua, &finder_ctx, &settings))?;
    niwa.set("finder", finder)?;

    Ok(())
}

fn declare_defaults(
    lua: &Lua,
    ctx: &Ctx,
    domain: &str,
    values: &Table,
    options: Option<&Table>,
) -> mlua::Result<Table> {
    let prov = provenance(lua);
    let spec = SpecCtx {
        resource: "niwa.defaults",
        provenance: &prov,
    };
    if domain.is_empty() {
        return Err(spec.fail("the domain cannot be empty"));
    }
    let restart = match options {
        Some(options) => {
            spec.no_unknown_fields(options, &["restart"])?;
            spec.opt_str(options, "restart")?
        }
        None => None,
    };

    let mut entries = Vec::new();
    for pair in values.pairs::<mlua::Value, mlua::Value>() {
        let (key, raw) = pair?;
        let mlua::Value::String(key) = key else {
            return Err(spec.fail("keys must be strings"));
        };
        let key = key.to_str()?.to_string();
        let value = spec.value(&key, &raw)?;
        entries.push((key, value));
    }
    if entries.is_empty() {
        return Err(spec.fail("declare at least one key"));
    }

    let mut truths = Vec::new();
    for (key, value) in entries {
        if let Some(truth) = record(ctx, &prov, domain, &key, value, restart.as_deref())? {
            truths.push(truth);
        }
    }
    result_table(lua, ctx, &aggregate(&truths))
}

/// One `defaults` key declaration. Everything that lowers to a
/// preference key comes through here, sugar included.
pub fn record(
    ctx: &Ctx,
    prov: &Provenance,
    domain: &str,
    key: &str,
    value: Value,
    restart: Option<&str>,
) -> mlua::Result<Option<crate::engine::Truth>> {
    // A key a configuration profile owns is not yours to declare:
    // writes would succeed and mean nothing. Fail naming the owner.
    // Profiles manage bare domains; an absolute-path domain is the
    // admin half of the machine, not MDM territory.
    let managed = crate::paths::Paths::managed_prefs().join(format!("{domain}.plist"));
    if !domain.starts_with('/')
        && let Ok(profile) = plist::Value::from_file(&managed)
        && profile
            .as_dictionary()
            .is_some_and(|dict| dict.contains_key(key))
    {
        let spec = SpecCtx {
            resource: "niwa.defaults",
            provenance: prov,
        };
        return Err(spec.fail(&format!(
            "{domain} {key} is managed by a configuration profile ({}) · the profile is the owner, remove the declaration",
            managed.display()
        )));
    }
    let mut fields = BTreeMap::new();
    fields.insert("value".to_string(), value);
    if let Some(restart) = restart {
        fields.insert("restart".to_string(), Value::Str(restart.to_string()));
    }
    settle_truth(
        ctx,
        &Declaration {
            identity: Identity::new(Kind::Defaults, format!("{domain}:{key}")),
            spec: Value::Map(fields),
            provenance: prov.clone(),
            unit: unit_of(prov),
            privileged: domain.starts_with("/Library"),
        },
    )
}

/// The dock sugar and its lowering table. `apps` becomes
/// `persistent-apps`; the provider turns the list into the plist shape
/// when it lands.
fn declare_dock(lua: &Lua, ctx: &Ctx, settings: &Table) -> mlua::Result<Table> {
    let prov = provenance(lua);
    let spec = SpecCtx {
        resource: "niwa.dock",
        provenance: &prov,
    };
    spec.no_unknown_fields(
        settings,
        &["autohide", "tilesize", "apps", "minimize_effect"],
    )?;
    let mut truths = Vec::new();

    if let Some(autohide) = spec.opt_bool(settings, "autohide")?
        && let Some(truth) = record(
            ctx,
            &prov,
            "com.apple.dock",
            "autohide",
            Value::Bool(autohide),
            Some("Dock"),
        )?
    {
        truths.push(truth);
    }
    if let Some(tilesize) = spec.opt_int(settings, "tilesize")?
        && let Some(truth) = record(
            ctx,
            &prov,
            "com.apple.dock",
            "tilesize",
            Value::Int(tilesize),
            Some("Dock"),
        )?
    {
        truths.push(truth);
    }
    match settings.get::<mlua::Value>("apps")? {
        mlua::Value::Nil => {}
        raw => {
            let value = spec.value("apps", &raw)?;
            let Value::List(_) = &value else {
                return Err(spec.fail("field `apps` expects a list of app names"));
            };
            if let Some(truth) = record(
                ctx,
                &prov,
                "com.apple.dock",
                "persistent-apps",
                value,
                Some("Dock"),
            )? {
                truths.push(truth);
            }
        }
    }
    if let Some(effect) = spec.opt_str(settings, "minimize_effect")? {
        if !["genie", "scale", "suck"].contains(&effect.as_str()) {
            return Err(spec.fail(&format!(
                "field `minimize_effect` expects \"genie\", \"scale\", or \"suck\", got \"{effect}\""
            )));
        }
        if let Some(truth) = record(
            ctx,
            &prov,
            "com.apple.dock",
            "mineffect",
            Value::Str(effect),
            Some("Dock"),
        )? {
            truths.push(truth);
        }
    }
    result_table(lua, ctx, &aggregate(&truths))
}

/// The finder sugar. `default_view` maps the readable names onto the
/// four-character codes the preference actually stores.
fn declare_finder(lua: &Lua, ctx: &Ctx, settings: &Table) -> mlua::Result<Table> {
    let prov = provenance(lua);
    let spec = SpecCtx {
        resource: "niwa.finder",
        provenance: &prov,
    };
    spec.no_unknown_fields(settings, &["show_hidden", "default_view", "path_in_title"])?;
    let mut truths = Vec::new();

    if let Some(show) = spec.opt_bool(settings, "show_hidden")?
        && let Some(truth) = record(
            ctx,
            &prov,
            "com.apple.finder",
            "AppleShowAllFiles",
            Value::Bool(show),
            Some("Finder"),
        )?
    {
        truths.push(truth);
    }
    if let Some(view) = spec.opt_str(settings, "default_view")? {
        let code = match view.as_str() {
            "list" => "Nlsv",
            "icon" => "icnv",
            "column" => "clmv",
            "gallery" => "glyv",
            other => {
                return Err(spec.fail(&format!(
                    "field `default_view` expects \"list\", \"icon\", \"column\", or \"gallery\", got \"{other}\""
                )));
            }
        };
        if let Some(truth) = record(
            ctx,
            &prov,
            "com.apple.finder",
            "FXPreferredViewStyle",
            Value::Str(code.to_string()),
            Some("Finder"),
        )? {
            truths.push(truth);
        }
    }
    if let Some(in_title) = spec.opt_bool(settings, "path_in_title")?
        && let Some(truth) = record(
            ctx,
            &prov,
            "com.apple.finder",
            "_FXShowPosixPathInTitle",
            Value::Bool(in_title),
            Some("Finder"),
        )?
    {
        truths.push(truth);
    }
    result_table(lua, ctx, &aggregate(&truths))
}

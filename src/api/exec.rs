//! The escape hatch and the one-shot marker: `niwa.run`, `niwa.once`,
//! `niwa.try`, and `niwa.service`.
//!
//! An unguarded command can never be idempotent, so the guard is
//! required by validation, not by convention. Inside `niwa.once` the
//! marker is the guard, so the requirement lifts there.

use std::collections::BTreeMap;

use mlua::{Function, Lua, Table};

use crate::model::{Declaration, Identity, Kind, Value};

use super::spec::{SpecCtx, parse_duration};
use super::{Ctx, provenance, settle, unit_of};

pub fn register(lua: &Lua, niwa: &Table, ctx: &Ctx) -> mlua::Result<()> {
    let run_ctx = ctx.clone();
    niwa.set(
        "run",
        lua.create_function(move |lua, (command, options): (String, Option<Table>)| {
            declare_run(lua, &run_ctx, &command, options.as_ref())
        })?,
    )?;

    let once_ctx = ctx.clone();
    niwa.set(
        "once",
        lua.create_function(move |lua, (name, body): (String, Function)| {
            declare_once(lua, &once_ctx, &name, &body)
        })?,
    )?;

    niwa.set(
        "try",
        lua.create_function(move |_, body: Function| {
            // At plan time nothing fails, so `try` is a plain call.
            // Failure semantics arrive with the execution engine.
            body.call::<mlua::Value>(())
        })?,
    )?;

    let service_ctx = ctx.clone();
    niwa.set(
        "service",
        lua.create_function(move |lua, options: Table| {
            declare_service(lua, &service_ctx, &options)
        })?,
    )?;

    Ok(())
}

fn declare_run(
    lua: &Lua,
    ctx: &Ctx,
    command: &str,
    options: Option<&Table>,
) -> mlua::Result<Table> {
    let prov = provenance(lua);
    let spec = SpecCtx {
        resource: "niwa.run",
        provenance: &prov,
    };
    if command.trim().is_empty() {
        return Err(spec.fail("the command cannot be empty"));
    }

    let mut fields = BTreeMap::new();
    let mut guarded = false;
    let mut privileged = false;
    if let Some(options) = options {
        spec.no_unknown_fields(
            options,
            &[
                "unless",
                "only_if",
                "creates",
                "timeout",
                "optional",
                "privileged",
            ],
        )?;
        privileged = spec.opt_bool(options, "privileged")?.unwrap_or(false);
        if let Some(unless) = spec.opt_bool(options, "unless")? {
            fields.insert("unless".to_string(), Value::Bool(unless));
            guarded = true;
        }
        if let Some(only_if) = spec.opt_bool(options, "only_if")? {
            fields.insert("only_if".to_string(), Value::Bool(only_if));
            guarded = true;
        }
        if let Some(creates) = spec.opt_str(options, "creates")? {
            fields.insert("creates".to_string(), Value::Str(creates));
            guarded = true;
        }
        if let Some(timeout) = spec.opt_str(options, "timeout")? {
            if parse_duration(&timeout).is_none() {
                return Err(spec.fail(&format!(
                    "field `timeout` expects a duration like \"30s\" or \"5m\", got \"{timeout}\""
                )));
            }
            fields.insert("timeout".to_string(), Value::Str(timeout));
        }
        if let Some(optional) = spec.opt_bool(options, "optional")? {
            fields.insert("optional".to_string(), Value::Bool(optional));
        }
    }

    let branch_guarded = ctx.state.borrow().results_read;
    if !guarded && !ctx.state.borrow().in_once && !branch_guarded {
        return Err(spec.fail(
            "a command needs a guard: add `unless`, `only_if`, or `creates` so the run can be skipped when it is already done",
        ));
    }

    settle(
        lua,
        ctx,
        &Declaration {
            identity: Identity::new(Kind::Run, command),
            spec: Value::Map(fields),
            provenance: prov.clone(),
            unit: unit_of(&prov),
            privileged,
        },
    )
}

/// `niwa.once(name, fn)`: the marker is the guard, and the journal
/// will record it as irreversible.
fn declare_once(lua: &Lua, ctx: &Ctx, name: &str, body: &Function) -> mlua::Result<Table> {
    let prov = provenance(lua);
    let spec = SpecCtx {
        resource: "niwa.once",
        provenance: &prov,
    };
    if name.is_empty() {
        return Err(spec.fail("the marker needs a name"));
    }

    let marker = Declaration {
        identity: Identity::new(Kind::Once, name),
        spec: Value::Map(BTreeMap::new()),
        provenance: prov.clone(),
        unit: unit_of(&prov),
        privileged: false,
    };

    // Exactly once means exactly once: a marker the journal already
    // holds skips the whole body, in the plan pass and the execute
    // pass alike. Check mode still runs it, to validate its specs.
    let already_done = ctx
        .engine
        .as_ref()
        .is_some_and(|engine| engine.is_acknowledged(&marker.identity.to_string()));
    if !already_done {
        // The body runs with the guard requirement lifted; the
        // marker is the guard.
        let previous = ctx.state.borrow().in_once;
        ctx.state.borrow_mut().in_once = true;
        let result = body.call::<mlua::Value>(());
        ctx.state.borrow_mut().in_once = previous;
        result?;
    }
    settle(lua, ctx, &marker)
}

/// `niwa.service`: a launchd agent as a declaration. Exactly one
/// schedule: `interval`, `calendar`, or `keepalive`.
fn declare_service(lua: &Lua, ctx: &Ctx, options: &Table) -> mlua::Result<Table> {
    let prov = provenance(lua);
    let spec = SpecCtx {
        resource: "niwa.service",
        provenance: &prov,
    };
    spec.no_unknown_fields(
        options,
        &[
            "label",
            "program",
            "interval",
            "calendar",
            "keepalive",
            "logs",
        ],
    )?;

    let label = spec.required_str(options, "label")?;
    if !label.contains('.') || label.chars().any(char::is_whitespace) {
        return Err(spec.fail(&format!(
            "field `label` expects a reverse-DNS name like \"dev.you.sync\", got \"{label}\""
        )));
    }

    let program = match options.get::<mlua::Value>("program")? {
        raw @ mlua::Value::Table(_) => match spec.value("program", &raw)? {
            Value::List(items)
                if !items.is_empty() && items.iter().all(|item| matches!(item, Value::Str(_))) =>
            {
                Value::List(items)
            }
            _ => {
                return Err(spec.fail(
                    "field `program` expects a list of strings: the executable, then its arguments",
                ));
            }
        },
        _ => {
            return Err(spec.fail(
                "field `program` expects a list of strings: the executable, then its arguments",
            ));
        }
    };

    let mut fields = BTreeMap::new();
    fields.insert("program".to_string(), program);

    let mut schedules = 0;
    if let Some(interval) = spec.opt_str(options, "interval")? {
        if parse_duration(&interval).is_none() {
            return Err(spec.fail(&format!(
                "field `interval` expects a duration like \"15m\", got \"{interval}\""
            )));
        }
        fields.insert("interval".to_string(), Value::Str(interval));
        schedules += 1;
    }
    if let Some(calendar) = calendar_field(&spec, options)? {
        fields.insert("calendar".to_string(), calendar);
        schedules += 1;
    }
    if let Some(keepalive) = spec.opt_bool(options, "keepalive")? {
        fields.insert("keepalive".to_string(), Value::Bool(keepalive));
        schedules += 1;
    }
    if schedules != 1 {
        return Err(
            spec.fail("declare exactly one schedule: `interval`, `calendar`, or `keepalive`")
        );
    }

    if let Some(logs) = spec.opt_str(options, "logs")? {
        fields.insert("logs".to_string(), Value::Str(logs));
    }

    settle(
        lua,
        ctx,
        &Declaration {
            identity: Identity::new(Kind::Service, label),
            spec: Value::Map(fields),
            provenance: prov.clone(),
            unit: unit_of(&prov),
            privileged: false,
        },
    )
}

fn calendar_field(spec: &SpecCtx<'_>, options: &Table) -> mlua::Result<Option<Value>> {
    match options.get::<mlua::Value>("calendar")? {
        mlua::Value::Nil => Ok(None),
        raw => match spec.value("calendar", &raw)? {
            Value::Map(map) => {
                for (key, value) in &map {
                    let known = ["minute", "hour", "day", "weekday"];
                    if !known.contains(&key.as_str()) {
                        return Err(spec.fail(&format!(
                            "field `calendar` knows minute, hour, day, and weekday; got `{key}`"
                        )));
                    }
                    if !matches!(value, Value::Int(_)) {
                        return Err(spec.fail(&format!("calendar `{key}` expects an integer")));
                    }
                }
                Ok(Some(Value::Map(map)))
            }
            _ => Err(spec.fail("field `calendar` expects a table like { hour = 3 }")),
        },
    }
}

//! Values, not resources: facts, queries, secrets, rendering, shared
//! modules, and the host hook. Nothing here carries a `Result` or
//! appears in a plan.

use std::collections::BTreeMap;
use std::os::unix::fs::PermissionsExt as _;

use mlua::{Lua, Table};

use crate::facts::Facts;
use crate::model::{Declaration, Identity, Kind, Value};

use super::spec::SpecCtx;
use super::{Ctx, freeze, provenance, settle_truth, unit_of};

pub fn register(lua: &Lua, niwa: &Table, ctx: &Ctx, facts: &Facts) -> mlua::Result<()> {
    let machine = lua.create_table()?;
    machine.set("name", facts.name.as_str())?;
    machine.set("owner", facts.owner.as_str())?;
    machine.set("arch", facts.arch.as_str())?;
    machine.set("os", facts.os.as_str())?;
    let tags = lua.create_table()?;
    for tag in &facts.tags {
        tags.set(tag.as_str(), true)?;
    }
    freeze(lua, &tags)?;
    machine.set("tags", tags)?;
    freeze(lua, &machine)?;
    niwa.set("machine", machine)?;

    niwa.set("home", ctx.home.to_string_lossy())?;

    let exists_ctx = ctx.clone();
    niwa.set(
        "exists",
        lua.create_function(move |lua, path: String| query_exists(lua, &exists_ctx, &path))?,
    )?;

    let command_ctx = ctx.clone();
    niwa.set(
        "command",
        lua.create_function(move |_, name: String| Ok(query_command(&command_ctx, &name)))?,
    )?;

    let secret_ctx = ctx.clone();
    niwa.set(
        "secret",
        lua.create_function(move |lua, arg: mlua::Value| make_secret(lua, &secret_ctx, &arg))?,
    )?;

    niwa.set(
        "render",
        lua.create_function(move |lua, (template, values): (String, Table)| {
            make_render(lua, &template, &values)
        })?,
    )?;

    let use_ctx = ctx.clone();
    niwa.set(
        "use",
        lua.create_function(move |lua, source: String| declare_use(lua, &use_ctx, &source))?,
    )?;

    let host_name = facts.name.clone();
    niwa.set(
        "host",
        lua.create_function(move |lua, (): ()| {
            if host_name.is_empty() {
                return Ok(());
            }
            crate::luau::load_host(lua, &host_name)
        })?,
    )?;

    Ok(())
}

/// `niwa.exists`, memoised for the run: twenty guards asking the same
/// question cost one answer.
fn query_exists(lua: &Lua, ctx: &Ctx, path: &str) -> mlua::Result<bool> {
    if let Some(known) = ctx.state.borrow().exists_cache.get(path) {
        return Ok(*known);
    }
    let prov = provenance(lua);
    let spec = SpecCtx {
        resource: "niwa.exists",
        provenance: &prov,
    };
    let resolved = ctx
        .self_path(path)
        .or_else(|| ctx.target_path(path))
        .ok_or_else(|| spec.fail(&format!("`{path}` must start with `~/`, `/`, or `@self/`")))?;
    let answer = resolved.exists();
    ctx.state
        .borrow_mut()
        .exists_cache
        .insert(path.to_string(), answer);
    Ok(answer)
}

/// `niwa.command`, memoised: is this name an executable on PATH?
fn query_command(ctx: &Ctx, name: &str) -> bool {
    if let Some(known) = ctx.state.borrow().command_cache.get(name) {
        return *known;
    }
    let answer = std::env::var_os("PATH").is_some_and(|path| {
        std::env::split_paths(&path).any(|dir| {
            let candidate = dir.join(name);
            std::fs::metadata(&candidate)
                .is_ok_and(|meta| meta.is_file() && meta.permissions().mode() & 0o111 != 0)
        })
    });
    ctx.state
        .borrow_mut()
        .command_cache
        .insert(name.to_string(), answer);
    answer
}

/// `niwa.secret` returns an opaque handle. Secrets resolve at apply
/// time, never at plan time, and never into the config.
fn make_secret(lua: &Lua, ctx: &Ctx, arg: &mlua::Value) -> mlua::Result<Table> {
    let prov = provenance(lua);
    let spec = SpecCtx {
        resource: "niwa.secret",
        provenance: &prov,
    };
    let (name, from) = match arg {
        mlua::Value::String(s) => (s.to_str()?.to_string(), None),
        mlua::Value::Table(options) => {
            spec.no_unknown_fields(options, &["name", "from"])?;
            (
                spec.required_str(options, "name")?,
                spec.opt_str(options, "from")?,
            )
        }
        other => {
            return Err(spec.fail(&format!(
                "expects a name or a table with `name` and `from`, got {}",
                other.type_name()
            )));
        }
    };
    if name.is_empty() {
        return Err(spec.fail("the secret needs a name"));
    }

    ctx.state
        .borrow_mut()
        .secrets_used
        .push((name.clone(), from.clone()));

    // The plan is where a missing secret fails, with the list of
    // places it looked — never halfway through an apply.
    if let Some(engine) = &ctx.engine
        && let Err(looked) = crate::secrets::exists(&engine.paths, &name, from.as_deref())
    {
        return Err(mlua::Error::external(crate::error::Error::SecretMissing {
            name,
            looked,
        }));
    }

    let secret = lua.create_table()?;
    secret.set("__secret", true)?;
    secret.set("name", name)?;
    if let Some(from) = from {
        secret.set("from", from)?;
    }
    freeze(lua, &secret)?;
    Ok(secret)
}

/// `niwa.render` validates the template against its values and returns
/// an opaque handle for `content =`. Substitution happens at apply
/// time, where secrets exist; the plan only ever sees the shape.
fn make_render(lua: &Lua, template: &str, values: &Table) -> mlua::Result<Table> {
    let prov = provenance(lua);
    let spec = SpecCtx {
        resource: "niwa.render",
        provenance: &prov,
    };

    let names = placeholders(template).map_err(|message| spec.fail(&message))?;
    for name in &names {
        match values.get::<mlua::Value>(name.as_str())? {
            mlua::Value::Nil => {
                return Err(spec.fail(&format!("placeholder `{{{name}}}` has no value")));
            }
            mlua::Value::String(_) | mlua::Value::Integer(_) | mlua::Value::Number(_) => {}
            mlua::Value::Table(t) if t.get::<bool>("__secret").unwrap_or(false) => {}
            other => {
                return Err(spec.fail(&format!(
                    "placeholder `{{{name}}}` expects a string, a number, or a secret, got {}",
                    other.type_name()
                )));
            }
        }
    }

    let rendered = lua.create_table()?;
    rendered.set("__render", true)?;
    rendered.set("template", template)?;
    rendered.set("values", values.clone())?;
    freeze(lua, &rendered)?;
    Ok(rendered)
}

/// The canonical spec shape of a rendered value, for `niwa.file` to
/// store: the template, and per placeholder either the plain value or
/// the secret's name. Secret values never enter a spec.
pub fn render_to_value(rendered: &Table) -> Option<Value> {
    if !rendered.get::<bool>("__render").unwrap_or(false) {
        return None;
    }
    let template: String = rendered.get("template").ok()?;
    let values: Table = rendered.get("values").ok()?;
    let mut map = BTreeMap::new();
    for pair in values.pairs::<String, mlua::Value>() {
        let (name, value) = pair.ok()?;
        let entry = match &value {
            mlua::Value::Table(t) if t.get::<bool>("__secret").unwrap_or(false) => {
                let secret: String = t.get("name").ok()?;
                let mut marker = BTreeMap::new();
                marker.insert("secret".to_string(), Value::Str(secret));
                if let Ok(from) = t.get::<String>("from") {
                    marker.insert("from".to_string(), Value::Str(from));
                }
                Value::Map(marker)
            }
            other => Value::from_lua(other).ok()?,
        };
        map.insert(name, entry);
    }
    let mut fields = BTreeMap::new();
    fields.insert("template".to_string(), Value::Str(template));
    fields.insert("values".to_string(), Value::Map(map));
    Some(Value::Map(fields))
}

/// `{name}` placeholders. No escape syntax yet: a template that needs
/// a literal brace does not exist in the design's examples, and a
/// clear error beats a quiet guess.
fn placeholders(template: &str) -> Result<Vec<String>, String> {
    let mut names = Vec::new();
    let mut rest = template;
    while let Some(start) = rest.find('{') {
        let after = &rest[start + 1..];
        let Some(end) = after.find('}') else {
            return Err("the template has an unclosed `{`".to_string());
        };
        let name = &after[..end];
        if name.is_empty() || !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
            return Err(format!("`{{{name}}}` is not a placeholder name"));
        }
        names.push(name.to_string());
        rest = &after[end + 1..];
    }
    if let Some(stray) = rest.find('}') {
        let _ = stray;
        return Err("the template has a stray `}`".to_string());
    }
    Ok(names)
}

/// `niwa.use("github:owner/repo@ref")`: recorded and pinned by the
/// lockfile when it lands; the module itself is fetched by resolve,
/// never during a plan.
fn declare_use(lua: &Lua, ctx: &Ctx, source: &str) -> mlua::Result<Table> {
    let prov = provenance(lua);
    let spec = SpecCtx {
        resource: "niwa.use",
        provenance: &prov,
    };
    let Some(rest) = source.strip_prefix("github:") else {
        return Err(spec.fail(&format!(
            "expects \"github:owner/repo@ref\", got \"{source}\""
        )));
    };
    let Some((repo, reference)) = rest.split_once('@') else {
        return Err(spec.fail(&format!(
            "pin a ref: \"github:{rest}@v1\" instead of \"{source}\""
        )));
    };
    let mut parts = repo.split('/');
    let owner_ok = parts.next().is_some_and(|p| !p.is_empty());
    let name_ok = parts.next().is_some_and(|p| !p.is_empty());
    if !(owner_ok && name_ok && parts.next().is_none()) || reference.is_empty() {
        return Err(spec.fail(&format!(
            "expects \"github:owner/repo@ref\", got \"{source}\""
        )));
    }

    let mut fields = BTreeMap::new();
    fields.insert("ref".to_string(), Value::Str(reference.to_string()));
    settle_truth(
        ctx,
        &Declaration {
            identity: Identity::new(Kind::Use, format!("github:{repo}")),
            spec: Value::Map(fields),
            provenance: prov.clone(),
            unit: unit_of(&prov),
            privileged: false,
        },
    )?;

    // The module itself: loaded from the content-addressed cache the
    // lockfile names, sandboxed exactly like the rest of the config.
    // A plan never fetches; an unresolved module is an error naming
    // the fix, and check stays quiet so a fresh clone still checks.
    if let Some(engine) = &ctx.engine {
        let lock = &engine.lock;
        let key = format!("github:{repo}");
        let Some(pin) = lock.uses.get(&key) else {
            return Err(mlua::Error::RuntimeError(format!(
                "{prov}: the module {source} is not resolved · run `niwa update`"
            )));
        };
        let cache = crate::modules::cache_dir(&engine.paths, &pin.sha256);
        let entry = cache.join("init.luau");
        if !entry.is_file() {
            return Err(mlua::Error::RuntimeError(format!(
                "{prov}: the module {source} is not cached on this machine · run `niwa update`"
            )));
        }
        crate::luau::load_external(lua, &entry, &format!("use:{repo}/init.luau"))?;
    }

    let handle = lua.create_table()?;
    freeze(lua, &handle)?;
    Ok(handle)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn placeholders_parse_and_malformed_templates_do_not() {
        assert_eq!(
            placeholders("machine {host} login {user}").unwrap(),
            vec!["host".to_string(), "user".to_string()]
        );
        assert_eq!(placeholders("no holes").unwrap(), Vec::<String>::new());
        assert!(placeholders("open {").is_err());
        assert!(placeholders("stray }").is_err());
        assert!(placeholders("{bad name}").is_err());
    }
}

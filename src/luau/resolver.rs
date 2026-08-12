//! Module resolution for the two aliases the design defines.
//!
//! `@niwa` is the API table. `@self/<path>` is a file in the config
//! repo, tried as `<path>.luau` and then `<path>/init.luau`. There is
//! no other way to load code: dynamic paths stay impossible, and every
//! chunk is named by its config-relative path so errors and provenance
//! read `modules/dev.luau:22`.

use std::cell::RefCell;
use std::collections::HashMap;
use std::path::PathBuf;
use std::rc::Rc;

use mlua::{Lua, RegistryKey, Value};

/// Registry slot holding the `@niwa` API table.
pub const NIWA_API: &str = "niwa.api";

struct Resolver {
    root: PathBuf,
    /// Finished modules, by config-relative chunk name.
    cache: RefCell<HashMap<String, RegistryKey>>,
    /// Modules currently loading, for cycle reports.
    loading: RefCell<Vec<String>>,
}

/// Register the `require` global. Must run before the sandbox seals
/// the global table.
pub fn install(lua: &Lua, root: &std::path::Path) -> mlua::Result<()> {
    let resolver = Rc::new(Resolver {
        root: root.to_path_buf(),
        cache: RefCell::new(HashMap::new()),
        loading: RefCell::new(Vec::new()),
    });
    lua.set_app_data(Rc::clone(&resolver));
    let require = lua.create_function(move |lua, spec: String| require(lua, &resolver, &spec))?;
    lua.globals().set("require", require)
}

/// Load `init.luau` through the same machinery every module uses.
pub fn run_entry(lua: &Lua) -> mlua::Result<()> {
    let resolver = lua
        .app_data_ref::<Rc<Resolver>>()
        .ok_or_else(|| mlua::Error::RuntimeError("the resolver is not installed".to_string()))?;
    load(lua, &resolver, "init").map(|_| ())
}

fn require(lua: &Lua, resolver: &Resolver, spec: &str) -> mlua::Result<Value> {
    if spec == "@niwa" {
        return lua.named_registry_value(NIWA_API);
    }
    let Some(rel) = spec.strip_prefix("@self/") else {
        return Err(mlua::Error::RuntimeError(format!(
            "unknown module path `{spec}`: use `@self/<path>` for files in your config, or `@niwa` for the niwa API"
        )));
    };
    load(lua, resolver, rel)
}

fn load(lua: &Lua, resolver: &Resolver, rel: &str) -> mlua::Result<Value> {
    if rel.split('/').any(|part| part.is_empty() || part == "..") {
        return Err(mlua::Error::RuntimeError(format!(
            "module path `{rel}` is not allowed: paths stay inside the config and cannot contain `..`"
        )));
    }

    let (file, name) = locate(resolver, rel)?;

    if let Some(key) = resolver.cache.borrow().get(&name) {
        return lua.registry_value(key);
    }
    if resolver.loading.borrow().contains(&name) {
        let chain = resolver.loading.borrow().join(" -> ");
        return Err(mlua::Error::RuntimeError(format!(
            "require cycle: {chain} -> {name}"
        )));
    }

    let source = std::fs::read_to_string(&file).map_err(|error| {
        mlua::Error::RuntimeError(format!("cannot read {}: {error}", file.display()))
    })?;

    resolver.loading.borrow_mut().push(name.clone());
    // The `@` prefix marks the chunk as a file, so errors and stack
    // frames read `modules/dev.luau:22` instead of a quoted string.
    let result = lua
        .load(&source)
        .set_name(format!("@{name}"))
        .call::<Value>(());
    resolver.loading.borrow_mut().pop();

    // Lua's own require returns `true` for a module that returns
    // nothing, and so does this one: the registry cannot hold nil.
    let value = match result? {
        Value::Nil => Value::Boolean(true),
        value => value,
    };
    let key = lua.create_registry_value(&value)?;
    resolver.cache.borrow_mut().insert(name, key);
    Ok(value)
}

/// `rel` to a file on disk plus its chunk name: `<rel>.luau` first,
/// then `<rel>/init.luau`.
fn locate(resolver: &Resolver, rel: &str) -> mlua::Result<(PathBuf, String)> {
    let direct = resolver.root.join(format!("{rel}.luau"));
    if direct.is_file() {
        return Ok((direct, format!("{rel}.luau")));
    }
    let nested = resolver.root.join(rel).join("init.luau");
    if nested.is_file() {
        return Ok((nested, format!("{rel}/init.luau")));
    }
    Err(mlua::Error::RuntimeError(format!(
        "module not found: `@self/{rel}` (looked for {rel}.luau and {rel}/init.luau)"
    )))
}

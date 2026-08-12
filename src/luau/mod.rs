//! The Luau embedding: a sandboxed VM with hard limits and an alias
//! resolver, and nothing else.
//!
//! The sandbox is load bearing. A config cannot open files, spawn
//! processes, or load libraries; every effect goes through the API
//! table that `require("@niwa")` returns. That is what makes the plan
//! complete, the journal trustworthy, and third-party modules
//! inspectable before they run.

mod resolver;

use std::cell::RefCell;
use std::path::Path;
use std::rc::Rc;
use std::time::{Duration, Instant};

use mlua::{Lua, VmState};

use crate::api::{Ctx, RunState};
use crate::engine::Engine;
use crate::error::Error;
use crate::facts::Facts;
use crate::model::Declaration;
use crate::paths::Paths;

pub use resolver::load_host;

pub struct Limits {
    /// Wall-clock budget for one whole config run.
    pub time: Duration,
    /// Ceiling for the VM's allocations.
    pub memory: usize,
}

impl Default for Limits {
    fn default() -> Self {
        // Generous for a config, hostile to a hang: an accidental
        // `while true` dies in seconds pointing at the config line,
        // and a runaway table cannot exhaust the machine.
        Self {
            time: Duration::from_secs(10),
            memory: 256 * 1024 * 1024,
        }
    }
}

pub struct Runtime {
    lua: Lua,
    time: Duration,
    state: Rc<RefCell<RunState>>,
}

impl Runtime {
    /// Build a sandboxed VM rooted at the config directory, with the
    /// full API surface behind `require("@niwa")`. Without an engine
    /// the pass validates and records; with one, resources predict or
    /// act according to its mode.
    pub fn new(paths: &Paths, limits: &Limits, engine: Option<Rc<Engine>>) -> Result<Self, Error> {
        let root: &Path = &paths.config;
        let home: &Path = &paths.home;
        let lua = Lua::new();
        lua.set_memory_limit(limits.memory).map_err(Error::from)?;

        resolver::install(&lua, root).map_err(Error::from)?;

        // Luau ships `loadstring`. A config that builds code out of
        // strings cannot be read before it runs, and inspectability is
        // the point of the sandbox, so it goes.
        lua.globals()
            .set("loadstring", mlua::Value::Nil)
            .map_err(Error::from)?;

        let state = Rc::new(RefCell::new(RunState::default()));
        let ctx = Ctx {
            state: Rc::clone(&state),
            root: root.to_path_buf(),
            home: home.to_path_buf(),
            engine,
        };
        let facts = Facts::gather(paths);
        let api = crate::api::build(&lua, &ctx, &facts).map_err(Error::from)?;
        lua.set_named_registry_value(resolver::NIWA_API, api)
            .map_err(Error::from)?;

        lua.sandbox(true).map_err(Error::from)?;

        Ok(Self {
            lua,
            time: limits.time,
            state,
        })
    }

    /// The declarations the run collected, in program order.
    pub fn declarations(&self) -> Vec<Declaration> {
        self.state.borrow().declarations.clone()
    }

    /// Every secret the config asked for, for doctor.
    pub fn secrets_used(&self) -> Vec<(String, Option<String>)> {
        self.state.borrow().secrets_used.clone()
    }

    /// Run `init.luau` from the config root, on the clock.
    pub fn run_entry(&self) -> Result<(), Error> {
        let deadline = Instant::now() + self.time;
        self.lua.set_interrupt(move |_| {
            if Instant::now() < deadline {
                Ok(VmState::Continue)
            } else {
                Err(mlua::Error::RuntimeError(
                    "the config ran past its time limit".to_string(),
                ))
            }
        });
        let result = resolver::run_entry(&self.lua);
        self.lua.remove_interrupt();
        result.map_err(Error::from)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sandbox_with(config: &str) -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("init.luau"), config).unwrap();
        dir
    }

    fn paths_in(dir: &Path) -> Paths {
        Paths {
            home: dir.to_path_buf(),
            config: dir.to_path_buf(),
            state: dir.join("state"),
            brew_prefix: dir.join("brew"),
            data: dir.join(".local/share"),
        }
    }

    #[test]
    fn a_config_that_never_finishes_dies_at_the_time_limit() {
        let dir = sandbox_with("while true do end");
        let limits = Limits {
            time: Duration::from_millis(200),
            memory: 64 * 1024 * 1024,
        };
        let runtime = Runtime::new(&paths_in(dir.path()), &limits, None).unwrap();
        let started = Instant::now();
        let error = runtime.run_entry().unwrap_err();
        assert!(started.elapsed() < Duration::from_secs(5));
        assert!(error.to_string().contains("config failed to load"));
        let Error::Script { message } = error else {
            panic!("expected a script error");
        };
        assert!(message.contains("time limit"), "{message}");
    }

    #[test]
    fn a_runaway_allocation_hits_the_memory_ceiling() {
        let dir =
            sandbox_with("local t = {}\nwhile true do t[#t + 1] = string.rep(\"x\", 65536) end");
        let limits = Limits {
            time: Duration::from_secs(30),
            memory: 8 * 1024 * 1024,
        };
        let runtime = Runtime::new(&paths_in(dir.path()), &limits, None).unwrap();
        let error = runtime.run_entry().unwrap_err();
        let Error::Script { message } = error else {
            panic!("expected a script error");
        };
        assert!(message.contains("memory"), "{message}");
    }
}

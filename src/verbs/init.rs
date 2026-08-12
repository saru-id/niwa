//! `niwa init`: once per machine. Not an empty file — a starter
//! config that already describes the machine it scanned, with the
//! empty rooms labelled, so the config teaches you as you read it.
//! The whole skeleton exists from the first run, `hosts/` included:
//! retrofitting that split later is the migration nobody enjoys, and
//! an empty directory costs nothing.

use std::process::ExitCode;
use std::time::Duration;

use crate::error::Error;
use crate::out::{Mark, Out, count};
use crate::paths::Paths;
use crate::util::proc::bounded_stdout;

/// The shipped type definitions, embedded so init can install them
/// with no network and no second file.
const TYPES: &str = include_str!("../../share/types/init.luau");

pub fn run(out: &Out) -> ExitCode {
    match init(out) {
        Ok(code) => code,
        Err(error) => {
            out.error(&error);
            ExitCode::FAILURE
        }
    }
}

fn init(out: &Out) -> Result<ExitCode, Error> {
    let paths = Paths::resolve()?;
    if paths.config.join("init.luau").is_file() {
        return Err(Error::Apply {
            doing: "initializing".to_string(),
            detail: format!(
                "{} already holds a config; init runs once per machine",
                paths.config.display()
            ),
        });
    }

    // The scan: what this machine already is.
    let formulae = crate::brew::requested_formulae(&paths);
    let casks = crate::brew::installed_casks(&paths);
    let name = crate::facts::Facts::gather(&paths).name;

    for dir in ["modules", "hosts", "files", "secrets"] {
        std::fs::create_dir_all(paths.config.join(dir)).map_err(|error| init_error(&error))?;
    }

    write(&paths, "init.luau", &init_luau())?;
    write(&paths, ".luaurc", LUAURC)?;
    write(&paths, "modules/cli.luau", &cli_luau(&formulae))?;
    write(&paths, "modules/apps.luau", &apps_luau(&casks))?;
    write(&paths, "modules/shell.luau", SHELL)?;
    write(&paths, "modules/dev.luau", DEV)?;
    write(&paths, "modules/desktop.luau", DESKTOP)?;
    write(&paths, "modules/system.luau", SYSTEM)?;
    write(&paths, "modules/services.luau", SERVICES)?;
    write(&paths, "modules/inbox.luau", INBOX)?;
    if !name.is_empty() {
        write(
            &paths,
            &format!("hosts/{name}.luau"),
            &format!(
                "--!strict\n-- This machine only. Loaded last: later declarations win,\n-- merged per key.\nlocal niwa = require(\"@niwa\")\n\nniwa.hostname(\"{name}\")\n"
            ),
        )?;
    }

    // The editor story: the shipped types, where `.luaurc` points.
    let types_dir = paths.data.join("niwa/types");
    std::fs::create_dir_all(&types_dir).map_err(|error| init_error(&error))?;
    std::fs::write(types_dir.join("init.luau"), TYPES).map_err(|error| init_error(&error))?;

    // The watcher, wired here and nowhere else.
    crate::watch::install(&paths)?;

    // The config is a normal git repository from its first minute.
    if !paths.config.join(".git").exists() {
        let repo = paths.config.display().to_string();
        let _ = bounded_stdout(
            "git",
            &["-C", &repo, "init", "-q", "-b", "main"],
            Duration::from_secs(30),
        );
    }

    out.result(
        Mark::Added,
        &format!(
            "a starter config is at {} · scanned {} and {}",
            paths.config.display(),
            count(formulae.len(), "formula"),
            count(casks.len(), "cask")
        ),
    );
    out.note("the watcher is loaded: it notifies, it never applies");
    out.note("review the modules, then commit the repo · `niwa plan` shows the first diff");
    Ok(ExitCode::SUCCESS)
}

fn write(paths: &Paths, relative: &str, content: &str) -> Result<(), Error> {
    std::fs::write(paths.config.join(relative), content).map_err(|error| init_error(&error))
}

fn init_error(error: &dyn std::fmt::Display) -> Error {
    Error::Apply {
        doing: "initializing the config".to_string(),
        detail: error.to_string(),
    }
}

fn init_luau() -> String {
    "--!strict\n-- The entire machine, from the top. Order is execution order.\nlocal niwa = require(\"@niwa\")\n\nrequire(\"@self/modules/cli\")\nrequire(\"@self/modules/apps\")\nrequire(\"@self/modules/shell\")\nrequire(\"@self/modules/dev\")\nrequire(\"@self/modules/desktop\")\nrequire(\"@self/modules/system\")\nrequire(\"@self/modules/services\")\nrequire(\"@self/modules/inbox\")\n\nniwa.host() -- hosts/<this machine>.luau, if it exists, loaded last\n".to_string()
}

const LUAURC: &str = "{\n  \"languageMode\": \"strict\",\n  \"aliases\": {\n    \"niwa\": \"~/.local/share/niwa/types\",\n    \"self\": \".\"\n  }\n}\n";

/// A scanned list renders four names to a line, the example's shape.
fn luau_list(names: &[String]) -> String {
    if names.is_empty() {
        return "{}".to_string();
    }
    let mut rendered = String::from("{\n");
    for chunk in names.chunks(4) {
        rendered.push_str("  ");
        let quoted: Vec<String> = chunk.iter().map(|name| format!("\"{name}\"")).collect();
        rendered.push_str(&quoted.join(", "));
        rendered.push_str(",\n");
    }
    rendered.push('}');
    rendered
}

fn cli_luau(formulae: &[String]) -> String {
    if formulae.is_empty() {
        return "--!strict\n-- Everyday CLI tools. (scanned: none yet)\nlocal niwa = require(\"@niwa\")\n\n-- niwa.brew.formula { \"jq\", \"ripgrep\" }\n".to_string();
    }
    format!(
        "--!strict\n-- Everyday CLI tools. (scanned: {} found)\nlocal niwa = require(\"@niwa\")\n\nniwa.brew.formula {}\n",
        formulae.len(),
        luau_list(formulae)
    )
}

fn apps_luau(casks: &[String]) -> String {
    if casks.is_empty() {
        return "--!strict\n-- GUI apps and fonts. Casks cover both. (scanned: none yet)\nlocal niwa = require(\"@niwa\")\n\n-- niwa.brew.cask { \"kitty\" }\n".to_string();
    }
    format!(
        "--!strict\n-- GUI apps and fonts. Casks cover both. (scanned: {} found)\nlocal niwa = require(\"@niwa\")\n\nniwa.brew.cask {}\n",
        casks.len(),
        luau_list(casks)
    )
}

const SHELL: &str = "--!strict\n-- Shell and terminal. Files are copied, not symlinked; edits made\n-- on the live side come home with `niwa pull`.\nlocal niwa = require(\"@niwa\")\n\n-- niwa.file(\"~/.zshrc\", { source = \"@self/files/zshrc\" })\n";

const DEV: &str = "--!strict\n-- Toolchains and editors. The starter declares luau-lsp, so the\n-- repo bootstraps its own editing experience.\nlocal niwa = require(\"@niwa\")\n\nniwa.brew.formula { \"luau-lsp\" }\n";

const DESKTOP: &str = "--!strict\n-- Dock, Finder, and the desktop itself.\nlocal niwa = require(\"@niwa\")\n\n-- niwa.dock { autohide = true, tilesize = 48 }\n-- niwa.finder { show_hidden = true, default_view = \"list\" }\n";

const SYSTEM: &str = "--!strict\n-- Keyboard, trackpad, firewall. The /Library half needs\n-- administrator rights; the plan says so before asking once.\nlocal niwa = require(\"@niwa\")\n\n-- niwa.defaults(\"NSGlobalDomain\", { KeyRepeat = 2 })\n";

const SERVICES: &str = "--!strict\n-- Launchd agents you own, and brew's daemons.\nlocal niwa = require(\"@niwa\")\n\n-- niwa.brew.service { \"postgresql@16\" }\n";

const INBOX: &str = "--!strict\n-- Staging: accepted proposals land here when no other module\n-- matches. Move lines out whenever you feel like it, or never.\nlocal niwa = require(\"@niwa\")\n";

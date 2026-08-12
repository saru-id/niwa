//! `niwa add`: install and write the line, in that order of honesty —
//! the config stays the source of truth, and the CLI is just a valid
//! way to edit it. Lines land by the same placement logic proposals
//! use, so there is one matching brain, not two.

use std::process::ExitCode;
use std::rc::Rc;

use crate::engine::{Engine, Mode};
use crate::error::Error;
use crate::journal::Journal;
use crate::model::{Declaration, Identity, Kind, Provenance, Unit, Value};
use crate::out::{Mark, Out};
use crate::paths::Paths;
use crate::proposals;

pub fn run(out: &Out, provider: &str, name: &str) -> ExitCode {
    match add(out, provider, name) {
        Ok(code) => code,
        Err(error) => {
            out.error(&error);
            ExitCode::FAILURE
        }
    }
}

fn add(out: &Out, provider: &str, name: &str) -> Result<ExitCode, Error> {
    if provider == "secret" {
        return add_secret(out, name);
    }
    let kind = match provider {
        "brew" => Kind::BrewFormula,
        "cask" => Kind::BrewCask,
        "npm" => Kind::Npm,
        other => {
            return Err(Error::Apply {
                doing: format!("adding through `{other}`"),
                detail: "add knows brew, cask, npm, and secret".to_string(),
            });
        }
    };

    let paths = Paths::resolve()?;
    let analysis = super::run_pass(&paths, None)?;

    let identity = Identity::new(kind, name);
    let kind = identity.kind.clone();
    if let Some(existing) = analysis
        .effective
        .iter()
        .find(|declaration| declaration.identity == identity)
    {
        out.result(
            Mark::Ok,
            &format!("{identity} is already declared at {}", existing.provenance),
        );
        return Ok(ExitCode::SUCCESS);
    }

    // The line first: if the install fails, a committed intent that
    // the next apply retries is the right leftover.
    let home = proposals::place(&analysis.effective, &kind, None);
    let statement = proposals::package_statement(&kind, name);
    proposals::append(&paths, &home, &statement)?;

    let declaration = Declaration {
        identity,
        spec: Value::Map(std::collections::BTreeMap::new()),
        provenance: Provenance {
            file: home.display().to_string(),
            line: 0,
        },
        unit: Unit::Module("add".to_string()),
        privileged: false,
    };
    let journal = Journal::load(&paths.state)?;
    let engine = Rc::new(Engine::new(
        Mode::Execute {
            force: false,
            skip_privileged: false,
            only: None,
            declined: std::collections::HashSet::new(),
        },
        paths.clone(),
        journal,
    ));
    engine.settle(&declaration)?;
    engine.finish()?;

    let installed = matches!(kind, Kind::BrewFormula | Kind::BrewCask)
        .then(|| crate::brew::installed(&paths, &kind, name))
        .flatten()
        .is_some()
        || matches!(kind, Kind::Npm) && crate::npm::installed(name);

    if installed {
        out.result(
            Mark::Added,
            &format!("{name} installed · line added to {}", home.display()),
        );
        Ok(ExitCode::SUCCESS)
    } else {
        out.result(
            Mark::Failed,
            &format!(
                "{name} did not install · the line waits in {} for the next apply",
                home.display()
            ),
        );
        Ok(ExitCode::FAILURE)
    }
}

/// `niwa add secret <name>`: seal a value into the repo. The value
/// comes from stdin, never from an argument — arguments leak into the
/// process list.
fn add_secret(out: &Out, name: &str) -> Result<ExitCode, Error> {
    use std::io::Read as _;
    let paths = Paths::resolve()?;
    if name.is_empty() || name.contains('/') {
        return Err(Error::Apply {
            doing: "sealing a secret".to_string(),
            detail: format!("`{name}` is not a secret name"),
        });
    }
    let mut value = String::new();
    std::io::stdin()
        .read_to_string(&mut value)
        .map_err(|error| Error::Apply {
            doing: "reading the value from stdin".to_string(),
            detail: error.to_string(),
        })?;
    let value = value.trim_end_matches(['\n', '\r']);
    if value.is_empty() {
        return Err(Error::Apply {
            doing: "sealing a secret".to_string(),
            detail: "stdin held no value to seal".to_string(),
        });
    }
    let sealed = crate::secrets::seal(&paths, value.as_bytes())?;
    let dir = paths.config.join("secrets");
    std::fs::create_dir_all(&dir).map_err(|error| Error::Apply {
        doing: "creating secrets/".to_string(),
        detail: error.to_string(),
    })?;
    let file = dir.join(format!("{name}.age"));
    std::fs::write(&file, sealed).map_err(|error| Error::Apply {
        doing: "writing the sealed file".to_string(),
        detail: error.to_string(),
    })?;
    out.result(
        Mark::Added,
        &format!("secrets/{name}.age sealed · niwa.secret({name:?}) resolves it"),
    );
    Ok(ExitCode::SUCCESS)
}

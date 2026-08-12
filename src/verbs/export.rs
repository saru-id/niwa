//! `niwa export --markdown`: the machine as a readable document,
//! generated from the thing it documents, so it cannot go stale.

use std::fmt::Write as _;
use std::process::ExitCode;

use crate::error::Error;
use crate::model::{Kind, Unit};
use crate::out::Out;
use crate::paths::Paths;

pub fn run(out: &Out, markdown: bool) -> ExitCode {
    match export(out, markdown) {
        Ok(code) => code,
        Err(error) => {
            out.error(&error);
            ExitCode::FAILURE
        }
    }
}

fn export(out: &Out, markdown: bool) -> Result<ExitCode, Error> {
    if !markdown {
        return Err(Error::apply(
            "exporting",
            "pass --markdown; it is the one format that exists",
        ));
    }
    let paths = Paths::resolve()?;
    let analysis = super::run_pass(&paths, None)?;
    let name = crate::facts::Facts::gather(&paths).name;

    let mut document = String::new();
    let _ = writeln!(document, "# {name}\n");
    let _ = writeln!(
        document,
        "{} resources, declared in `~/.config/niwa`.",
        analysis.effective.len()
    );

    let mut units: Vec<String> = Vec::new();
    for declaration in &analysis.effective {
        let unit = unit_name(&declaration.unit);
        if !units.contains(&unit) {
            units.push(unit);
        }
    }

    for unit in &units {
        let _ = writeln!(document, "\n## {unit}\n");
        let mut manual = Vec::new();
        for declaration in &analysis.effective {
            if &unit_name(&declaration.unit) != unit {
                continue;
            }
            match &declaration.identity.kind {
                Kind::Permission | Kind::Manual => manual.push(declaration),
                _ => {
                    let _ = writeln!(document, "- `{}`", declaration.identity);
                }
            }
        }
        if !manual.is_empty() {
            document.push_str("\nStays manual:\n\n");
            for declaration in manual {
                let _ = writeln!(document, "- {}", declaration.identity.key);
            }
        }
    }

    out.raw(&document);
    Ok(ExitCode::SUCCESS)
}

fn unit_name(unit: &Unit) -> String {
    match unit {
        Unit::Init => "init".to_string(),
        Unit::Module(name) | Unit::Host(name) => name.clone(),
    }
}

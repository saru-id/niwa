//! `niwa seal-key`: back the sealing key up into the repo, and bring
//! it back on a new machine. The escrow is passphrase-encrypted in
//! process before anything touches disk; the repo only ever holds
//! ciphertext. Losing every machine costs one passphrase, not the
//! files.

use std::io::IsTerminal as _;
use std::process::ExitCode;
use std::time::Duration;

use crate::error::Error;
use crate::out::{Mark, Out};
use crate::paths::Paths;
use crate::util::proc::bounded_output;

pub fn run(out: &Out, action: &str) -> ExitCode {
    match seal_key(out, action) {
        Ok(code) => code,
        Err(error) => {
            out.error(&error);
            ExitCode::FAILURE
        }
    }
}

fn seal_key(out: &Out, action: &str) -> Result<ExitCode, Error> {
    let paths = Paths::resolve()?;
    match action {
        "backup" => {
            let passphrase = read_passphrase("choose a passphrase for the escrow: ")?;
            let escrow = crate::secrets::backup_key(&paths, &passphrase)?;
            out.result(
                Mark::Ok,
                &format!(
                    "the sealing key is escrowed at {} · commit it with the config",
                    escrow
                        .strip_prefix(&paths.config)
                        .unwrap_or(&escrow)
                        .display()
                ),
            );
            Ok(ExitCode::SUCCESS)
        }
        "restore" => {
            let passphrase = read_passphrase("the escrow's passphrase: ")?;
            crate::secrets::restore_key(&paths, &passphrase)?;
            out.result(Mark::Ok, "the sealing key is restored on this machine");
            Ok(ExitCode::SUCCESS)
        }
        other => Err(Error::Apply {
            doing: format!("seal-key {other}"),
            detail: "seal-key knows backup and restore".to_string(),
        }),
    }
}

/// A passphrase, without an echo when a terminal is attached. The
/// echo dance goes through stty; piped input just reads a line, which
/// is what drills do.
fn read_passphrase(prompt: &str) -> Result<String, Error> {
    let tty = std::io::stdin().is_terminal();
    if tty {
        eprint!("{prompt}");
        let _ = bounded_output("stty", &["-echo"], Duration::from_secs(5));
    }
    let mut line = String::new();
    let read = std::io::stdin().read_line(&mut line);
    if tty {
        let _ = bounded_output("stty", &["echo"], Duration::from_secs(5));
        eprintln!();
    }
    read.map_err(|error| Error::apply("reading the passphrase", error))?;
    let passphrase = line.trim_end_matches(['\n', '\r']).to_string();
    if passphrase.is_empty() {
        return Err(Error::apply(
            "reading the passphrase",
            "an empty passphrase seals nothing",
        ));
    }
    Ok(passphrase)
}

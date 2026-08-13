//! Secrets: resolved at apply time, never at plan time, never into
//! the config.
//!
//! Resolution is explicit and ordered: the macOS keychain, then
//! `secrets/<name>.age` in the repo, then an external manager when
//! one is configured. A missing secret fails the plan with the list
//! of places it looked. The sealing key is one X25519 identity per
//! user, kept in the state directory with owner-only permissions;
//! `seal-key backup` escrows it in the repo, passphrase-encrypted in
//! process, so the repo only ever holds ciphertext.

use std::io::{Read as _, Write as _};
use std::path::PathBuf;
use std::time::Duration;

use age::secrecy::ExposeSecret as _;

use crate::error::Error;
use crate::paths::Paths;
use crate::util::proc::{bounded_output, bounded_stdout};

const KEY_FILE: &str = "seal.key";

/// Where a secret may come from when `from =` forces one place.
fn place_of(from: &str) -> Option<&'static str> {
    match from {
        "keychain" => Some("keychain"),
        "age" => Some("age"),
        "external" | "op" => Some("external"),
        _ => None,
    }
}

/// Look for a secret without reading it. `Err` carries the places
/// that were searched, for the plan's honest failure.
pub fn exists(paths: &Paths, name: &str, from: Option<&str>) -> Result<(), Vec<String>> {
    search(paths, name, from, false).map(|_| ())
}

/// Read a secret's value, in the configured order.
pub fn resolve(paths: &Paths, name: &str, from: Option<&str>) -> Result<String, Vec<String>> {
    search(paths, name, from, true).map(Option::unwrap_or_default)
}

fn search(
    paths: &Paths,
    name: &str,
    from: Option<&str>,
    read: bool,
) -> Result<Option<String>, Vec<String>> {
    let forced = from.and_then(place_of);
    let mut looked = Vec::new();

    for place in ["keychain", "age", "external"] {
        if forced.is_some_and(|only| only != place) {
            continue;
        }
        match place {
            "keychain" => {
                looked.push("the keychain (service \"niwa\")".to_string());
                if keychain_has(name) {
                    if !read {
                        return Ok(None);
                    }
                    if let Some(value) = keychain_read(name) {
                        return Ok(Some(value));
                    }
                }
            }
            "age" => {
                let sealed = paths.config.join("secrets").join(format!("{name}.age"));
                looked.push(format!("secrets/{name}.age in the config"));
                if sealed.is_file() {
                    if !read {
                        return Ok(None);
                    }
                    match std::fs::read(&sealed).map(|bytes| unseal(paths, &bytes)) {
                        Ok(Ok(clear)) => {
                            return Ok(Some(
                                String::from_utf8_lossy(&clear).trim_end().to_string(),
                            ));
                        }
                        // The file is there and will not open: that is
                        // a key problem, not an absence, and the words
                        // must send the person to the key.
                        _ => looked.push(format!(
                            "secrets/{name}.age exists but did not decrypt · is this machine's sealing key the repo's? (`niwa seal-key restore`)"
                        )),
                    }
                }
            }
            _ => {
                // An external manager joins here when one is
                // configured; today none is, and saying so beats
                // pretending to have searched.
            }
        }
    }
    Err(looked)
}

fn keychain_has(name: &str) -> bool {
    bounded_output(
        "security",
        &["find-generic-password", "-s", "niwa", "-a", name],
        Duration::from_secs(10),
    )
    .is_some_and(|finished| finished.code == Some(0))
}

fn keychain_read(name: &str) -> Option<String> {
    bounded_stdout(
        "security",
        &["find-generic-password", "-s", "niwa", "-a", name, "-w"],
        Duration::from_secs(10),
    )
}

fn key_path(paths: &Paths) -> PathBuf {
    paths.state.join(KEY_FILE)
}

/// The machine's sealing identity, created on first use with
/// owner-only permissions.
pub fn identity(paths: &Paths) -> Result<age::x25519::Identity, Error> {
    let path = key_path(paths);
    match std::fs::read_to_string(&path) {
        Ok(text) => {
            for line in text.lines() {
                if let Ok(identity) = line.trim().parse::<age::x25519::Identity>() {
                    return Ok(identity);
                }
            }
            return Err(Error::Apply {
                doing: "reading the sealing key".to_string(),
                detail: format!("{} does not hold an age identity", path.display()),
            });
        }
        // Only a key that is truly absent may be generated. Any
        // other failure must surface: regenerating over an unreadable
        // key would orphan every archive and secret sealed to it.
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => {
            return Err(Error::Apply {
                doing: "reading the sealing key".to_string(),
                detail: format!("{}: {error}", path.display()),
            });
        }
    }
    let identity = age::x25519::Identity::generate();
    std::fs::create_dir_all(&paths.state)
        .map_err(|error| Error::apply("creating the state directory", error))?;
    // Born private: the mode lands on the temp before the rename,
    // so the identity is never readable wider, not even briefly.
    crate::util::write_atomic(
        &path,
        identity.to_string().expose_secret().as_bytes(),
        Some(0o600),
        true,
    )
    .map_err(|error| Error::apply("writing the sealing key", error))?;
    Ok(identity)
}

/// Encrypt bytes to this machine's own identity.
pub fn seal(paths: &Paths, clear: &[u8]) -> Result<Vec<u8>, Error> {
    let recipient = identity(paths)?.to_public();
    let encryptor =
        age::Encryptor::with_recipients(std::iter::once(&recipient as &dyn age::Recipient))
            .map_err(|error| seal_error(&error))?;
    let mut sealed = Vec::new();
    let mut writer = encryptor
        .wrap_output(&mut sealed)
        .map_err(|error| seal_error(&error))?;
    writer
        .write_all(clear)
        .map_err(|error| seal_error(&error))?;
    writer.finish().map_err(|error| seal_error(&error))?;
    Ok(sealed)
}

/// Decrypt bytes sealed to this machine.
pub fn unseal(paths: &Paths, sealed: &[u8]) -> Result<Vec<u8>, Error> {
    let identity = identity(paths)?;
    let decryptor = age::Decryptor::new(sealed).map_err(|error| seal_error(&error))?;
    let mut reader = decryptor
        .decrypt(std::iter::once(&identity as &dyn age::Identity))
        .map_err(|error| seal_error(&error))?;
    let mut clear = Vec::new();
    reader
        .read_to_end(&mut clear)
        .map_err(|error| seal_error(&error))?;
    Ok(clear)
}

/// Is this blob an age file? The header is the honest marker.
pub fn is_sealed(bytes: &[u8]) -> bool {
    bytes.starts_with(b"age-encryption.org/")
        || bytes.starts_with(b"-----BEGIN AGE ENCRYPTED FILE-----")
}

/// Escrow the sealing key into the repo, passphrase-encrypted in
/// process before anything touches disk.
pub fn backup_key(paths: &Paths, passphrase: &str) -> Result<PathBuf, Error> {
    let key_text = std::fs::read(key_path(paths)).map_err(|error| Error::Apply {
        doing: "reading the sealing key".to_string(),
        detail: format!("{error}; nothing has been sealed yet"),
    })?;
    let encryptor = age::Encryptor::with_user_passphrase(age::secrecy::SecretString::from(
        passphrase.to_string(),
    ));
    let mut sealed = Vec::new();
    let mut writer = encryptor
        .wrap_output(&mut sealed)
        .map_err(|error| seal_error(&error))?;
    writer
        .write_all(&key_text)
        .map_err(|error| seal_error(&error))?;
    writer.finish().map_err(|error| seal_error(&error))?;

    let escrow_dir = paths.config.join("secrets");
    std::fs::create_dir_all(&escrow_dir)
        .map_err(|error| Error::apply("creating secrets/", error))?;
    let escrow = escrow_dir.join("seal-key.age");
    std::fs::write(&escrow, sealed).map_err(|error| Error::apply("writing the escrow", error))?;
    Ok(escrow)
}

/// Restore the sealing key from the repo's escrow.
pub fn restore_key(paths: &Paths, passphrase: &str) -> Result<(), Error> {
    let escrow = paths.config.join("secrets").join("seal-key.age");
    let sealed = std::fs::read(&escrow).map_err(|error| Error::Apply {
        doing: "reading the escrow".to_string(),
        detail: format!("{}: {error}", escrow.display()),
    })?;
    let decryptor = age::Decryptor::new(&sealed[..]).map_err(|error| seal_error(&error))?;
    let identity =
        age::scrypt::Identity::new(age::secrecy::SecretString::from(passphrase.to_string()));
    let mut reader = decryptor
        .decrypt(std::iter::once(&identity as &dyn age::Identity))
        .map_err(|_| Error::apply("unlocking the escrow", "the passphrase does not open it"))?;
    let mut clear = Vec::new();
    reader
        .read_to_end(&mut clear)
        .map_err(|error| seal_error(&error))?;

    std::fs::create_dir_all(&paths.state)
        .map_err(|error| Error::apply("creating the state directory", error))?;
    // Born 0600 and renamed into place: the key is never readable
    // wider, and a failed chmod cannot leave it open.
    crate::util::write_atomic(&key_path(paths), &clear, Some(0o600), true)
        .map_err(|error| Error::apply("writing the sealing key", error))?;
    Ok(())
}

fn seal_error(error: &dyn std::fmt::Display) -> Error {
    Error::apply("sealing", error)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn paths_in(dir: &std::path::Path) -> Paths {
        Paths {
            home: dir.to_path_buf(),
            config: dir.join("config"),
            state: dir.join("state"),
            brew_prefix: dir.join("brew"),
            data: dir.join("data"),
        }
    }

    #[test]
    fn seal_and_unseal_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let paths = paths_in(dir.path());
        let sealed = seal(&paths, b"the plain truth").unwrap();
        assert!(is_sealed(&sealed));
        assert_ne!(sealed, b"the plain truth");
        assert_eq!(unseal(&paths, &sealed).unwrap(), b"the plain truth");
    }

    #[test]
    fn the_escrow_round_trips_through_a_passphrase() {
        let dir = tempfile::tempdir().unwrap();
        let paths = paths_in(dir.path());
        let sealed = seal(&paths, b"x").unwrap();

        backup_key(&paths, "horse battery").unwrap();
        let escrow = paths.config.join("secrets/seal-key.age");
        assert!(escrow.is_file());
        let escrow_bytes = std::fs::read(&escrow).unwrap();
        assert!(is_sealed(&escrow_bytes));

        // A second machine: same repo, fresh state.
        std::fs::remove_file(paths.state.join("seal.key")).unwrap();
        restore_key(&paths, "horse battery").unwrap();
        assert_eq!(unseal(&paths, &sealed).unwrap(), b"x");
    }

    #[test]
    fn the_wrong_passphrase_does_not_open_the_escrow() {
        let dir = tempfile::tempdir().unwrap();
        let paths = paths_in(dir.path());
        let _ = seal(&paths, b"x").unwrap();
        backup_key(&paths, "right").unwrap();
        assert!(restore_key(&paths, "wrong").is_err());
    }

    #[test]
    fn a_missing_age_secret_names_the_file_it_wanted() {
        // Forced to the age place so the probe never shells out; the
        // every-place listing is proven end to end with a stubbed
        // keychain in tests/output.rs.
        let dir = tempfile::tempdir().unwrap();
        let paths = paths_in(dir.path());
        let places = exists(&paths, "github-token", Some("age")).unwrap_err();
        assert!(
            places
                .iter()
                .any(|place| place.contains("github-token.age"))
        );
    }

    #[test]
    fn a_sealed_repo_secret_resolves() {
        let dir = tempfile::tempdir().unwrap();
        let paths = paths_in(dir.path());
        let sealed = seal(&paths, b"hunter2\n").unwrap();
        std::fs::create_dir_all(paths.config.join("secrets")).unwrap();
        std::fs::write(paths.config.join("secrets/token.age"), sealed).unwrap();
        assert_eq!(resolve(&paths, "token", Some("age")).unwrap(), "hunter2");
        assert!(exists(&paths, "token", Some("age")).is_ok());
    }
}

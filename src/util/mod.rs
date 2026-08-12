//! The utility floor: pure helpers with no niwa knowledge, shared by
//! every layer above.

pub mod proc;

/// Parse a human duration: `500ms`, `30s`, `5m`, `2h`.
pub fn parse_duration(text: &str) -> Option<std::time::Duration> {
    let (digits, unit) = text.split_at(text.find(|c: char| !c.is_ascii_digit())?);
    let amount: u64 = digits.parse().ok()?;
    let millis = match unit {
        "ms" => amount,
        "s" => amount.checked_mul(1000)?,
        "m" => amount.checked_mul(60 * 1000)?,
        "h" => amount.checked_mul(60 * 60 * 1000)?,
        _ => return None,
    };
    Some(std::time::Duration::from_millis(millis))
}

/// The digest format acknowledgements and checksums use: sha256, hex.
pub fn digest(bytes: &[u8]) -> String {
    use sha2::Digest as _;
    use std::fmt::Write as _;
    let hash = sha2::Sha256::digest(bytes);
    let mut out = String::with_capacity(64);
    for byte in hash {
        let _ = write!(out, "{byte:02x}");
    }
    out
}

/// Write bytes so the target is never torn: a unique temp beside it,
/// the mode set before the rename, and the rename as the atom. Two
/// concurrent writers cannot rename each other's half-written temp,
/// because each temp carries its writer's pid. `sync` forces the
/// bytes to disk first — for ledgers that must survive power loss.
pub fn write_atomic(
    target: &std::path::Path,
    bytes: &[u8],
    mode: Option<u32>,
    sync: bool,
) -> std::io::Result<()> {
    let parent = target
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty());
    let name = target
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    let temp_name = format!(".{name}.niwa-{}", std::process::id());
    let temp = parent.map_or_else(
        || std::path::PathBuf::from(&temp_name),
        |p| p.join(&temp_name),
    );
    let result = (|| {
        {
            use std::io::Write as _;
            let mut file = std::fs::File::create(&temp)?;
            file.write_all(bytes)?;
            if sync {
                file.sync_all()?;
            }
        }
        if let Some(mode) = mode {
            use std::os::unix::fs::PermissionsExt as _;
            std::fs::set_permissions(&temp, std::fs::Permissions::from_mode(mode))?;
        }
        std::fs::rename(&temp, target)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temp);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn durations_parse_with_their_units() {
        assert_eq!(parse_duration("500ms"), Some(Duration::from_millis(500)));
        assert_eq!(parse_duration("30s"), Some(Duration::from_secs(30)));
        assert_eq!(parse_duration("5m"), Some(Duration::from_mins(5)));
        assert_eq!(parse_duration("2h"), Some(Duration::from_hours(2)));
    }

    #[test]
    fn junk_durations_parse_to_nothing() {
        for junk in ["", "10", "s", "10d", "-5s", "1.5h"] {
            assert_eq!(parse_duration(junk), None, "{junk}");
        }
    }

    #[test]
    fn atomic_writes_land_whole_with_their_mode() {
        use std::os::unix::fs::PermissionsExt as _;
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("app.json");
        write_atomic(&target, b"first", None, false).unwrap();
        write_atomic(&target, b"second", Some(0o600), true).unwrap();
        assert_eq!(std::fs::read(&target).unwrap(), b"second");
        assert_eq!(
            std::fs::metadata(&target).unwrap().permissions().mode() & 0o777,
            0o600
        );
        // No temp litter survives, success or failure.
        let leftovers: Vec<_> = std::fs::read_dir(dir.path())
            .unwrap()
            .flatten()
            .filter(|entry| entry.file_name().to_string_lossy().contains("niwa-"))
            .collect();
        assert!(leftovers.is_empty());
    }

    #[test]
    fn digests_are_sha256_hex() {
        assert_eq!(
            digest(b""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
        assert_eq!(digest(b"niwa").len(), 64);
    }
}

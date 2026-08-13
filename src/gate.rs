//! The secret gate: the config repo is now the thing that must never
//! leak, so the gate lives where the risk moved.
//!
//! Detection is patterns plus entropy, not a keyword list: known
//! credential shapes are named outright, and long high-entropy tokens
//! are flagged even when their shape is new. Sealed files are skipped
//! — ciphertext in `secrets/` is the system working as designed — and
//! so is the lockfile, whose hashes are exactly the kind of string an
//! entropy check exists to catch.

use std::path::Path;

/// One suspicious line: where, and why.
pub struct Hit {
    pub file: String,
    pub line: usize,
    pub reason: String,
}

/// Scan a whole config repo, `files/` included.
pub fn scan_repo(root: &Path) -> Vec<Hit> {
    let mut hits = Vec::new();
    walk(root, root, &mut hits);
    hits
}

fn walk(root: &Path, dir: &Path, hits: &mut Vec<Hit>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') || name == "secrets" || name == "niwa.lock" {
            continue;
        }
        if path.is_dir() {
            walk(root, &path, hits);
        } else if let Ok(bytes) = std::fs::read(&path) {
            let relative = path
                .strip_prefix(root)
                .unwrap_or(&path)
                .display()
                .to_string();
            for (line, reason) in scan_bytes(&bytes) {
                hits.push(Hit {
                    file: relative.clone(),
                    line,
                    reason,
                });
            }
        }
    }
}

/// Scan one file's bytes. Returns line numbers (1-based) and reasons.
pub fn scan_bytes(bytes: &[u8]) -> Vec<(usize, String)> {
    let Ok(text) = std::str::from_utf8(bytes) else {
        // Binary content is not scannable line by line; the entropy
        // check would flag every compressed byte. Skipped, stated.
        return Vec::new();
    };
    let mut findings = Vec::new();
    for (index, line) in text.lines().enumerate() {
        let number = index + 1;
        if let Some(reason) = known_shape(line) {
            findings.push((number, reason));
        } else if let Some(token) = high_entropy_token(line) {
            findings.push((
                number,
                format!("a high-entropy token that reads like a credential ({token})"),
            ));
        }
    }
    findings
}

/// Credential shapes worth naming outright.
fn known_shape(line: &str) -> Option<String> {
    if line.contains("PRIVATE KEY-----") {
        return Some("a private key".to_string());
    }
    let prefixes: [(&str, &str); 6] = [
        ("AKIA", "an AWS access key id"),
        ("ghp_", "a GitHub personal access token"),
        ("github_pat_", "a GitHub fine-grained token"),
        ("xoxb-", "a Slack bot token"),
        ("xoxp-", "a Slack user token"),
        ("sk-ant-", "an Anthropic API key"),
    ];
    for word in line.split(|c: char| !(c.is_ascii_alphanumeric() || c == '_' || c == '-')) {
        for (prefix, name) in prefixes {
            if word.starts_with(prefix) && word.len() >= prefix.len() + 12 {
                return Some(format!("{name} ({}…)", &word[..prefix.len() + 4]));
            }
        }
    }
    None
}

/// A long token whose characters are too evenly spread to be words.
/// Hex digests sit at 4.0 bits per character; the threshold sits
/// safely above them, where random base64 lives.
fn high_entropy_token(line: &str) -> Option<String> {
    for word in line.split(|c: char| {
        !(c.is_ascii_alphanumeric() || c == '+' || c == '/' || c == '=' || c == '_' || c == '-')
    }) {
        if word.len() < 28 {
            continue;
        }
        let mixed = word.chars().any(|c| c.is_ascii_uppercase())
            && word.chars().any(|c| c.is_ascii_lowercase())
            && word.chars().any(|c| c.is_ascii_digit());
        if mixed && entropy(word) > 4.6 {
            return Some(format!("{}…", &word[..8.min(word.len())]));
        }
    }
    None
}

#[allow(
    clippy::cast_precision_loss,
    reason = "line tokens are far below the 52-bit mantissa"
)]
fn entropy(word: &str) -> f64 {
    let mut counts = [0usize; 256];
    for byte in word.bytes() {
        counts[byte as usize] += 1;
    }
    let length = word.len() as f64;
    counts
        .iter()
        .filter(|&&count| count > 0)
        .map(|&count| {
            let probability = count as f64 / length;
            -probability * probability.log2()
        })
        .sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_known_credential_shape_is_named() {
        // One row per shape the gate promises to catch: the token,
        // and the words the reason must carry.
        let table: [(&str, &str); 7] = [
            (
                "machine api.github.com password ghp_AbCdEfGhIjKlMnOpQrStUvWxYz012345",
                "GitHub personal",
            ),
            (
                "token = github_pat_11AAAAAAA0abcdefghijklmnop",
                "fine-grained",
            ),
            ("aws_access_key_id = AKIAIOSFODNN7EXAMPLE", "AWS"),
            ("SLACK=xoxb-2222222222-abcdefghijklm", "Slack bot"),
            ("SLACK=xoxp-1111111111-abcdefghijklm", "Slack user"),
            (
                "export ANTHROPIC_API_KEY=sk-ant-api03-abcdefghijklmnop",
                "Anthropic",
            ),
            ("-----BEGIN OPENSSH PRIVATE KEY-----", "private key"),
        ];
        for (line, expected) in table {
            let hits = scan_bytes(format!("{line}\n").as_bytes());
            assert_eq!(hits.len(), 1, "missed: {line}");
            assert!(hits[0].1.contains(expected), "{line} → {}", hits[0].1);
        }
    }

    #[test]
    fn scan_repo_skips_secrets_dotfiles_and_the_lockfile() {
        let dir = tempfile::tempdir().unwrap();
        let secret = "password ghp_AbCdEfGhIjKlMnOpQrStUvWxYz012345\n";
        std::fs::create_dir_all(dir.path().join("secrets")).unwrap();
        std::fs::create_dir_all(dir.path().join(".git")).unwrap();
        std::fs::write(dir.path().join("secrets/leaky"), secret).unwrap();
        std::fs::write(dir.path().join(".git/config"), secret).unwrap();
        std::fs::write(dir.path().join(".netrc"), secret).unwrap();
        std::fs::write(dir.path().join("niwa.lock"), secret).unwrap();
        std::fs::write(dir.path().join("caught.luau"), secret).unwrap();
        let hits = scan_repo(dir.path());
        let files: Vec<&str> = hits.iter().map(|hit| hit.file.as_str()).collect();
        assert_eq!(files, ["caught.luau"]);
    }

    #[test]
    fn random_tokens_trip_the_entropy_check() {
        let hits = scan_bytes(b"export TOKEN=q7Rv2mXz9Kp4Lw8Nt3Jd6Fh1Bg5Yc0SaUeIoP\n");
        assert_eq!(hits.len(), 1, "{hits:?}");
    }

    #[test]
    fn ordinary_config_text_passes() {
        let clean = b"export EDITOR=nvim\nalias ls=\"eza\"\n# a long ordinary comment line about the configuration\n";
        assert!(scan_bytes(clean).is_empty());
    }

    #[test]
    fn hex_digests_do_not_trip_the_gate() {
        let lock =
            b"sha256 = \"9f2c7e1ab44c1d5f0d1f5f7c3f2e9a41b8a06d7c4a5b9e3d2c1f0a9b8c7d6e5f\"\n";
        assert!(scan_bytes(lock).is_empty());
    }
}

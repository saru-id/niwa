//! GitHub releases: resolved by tag into the lockfile, installed by
//! checksum, never by trust.
//!
//! `update` asks the API for the latest release, downloads the
//! matching asset once to hash it, and records version plus sha256.
//! Install downloads again, refuses anything whose digest is not the
//! recorded one, and puts the binary into `~/.local/bin`. curl and
//! tar are invoked on deadlines; drills stand their own in.

use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::error::Error;
use crate::journal::digest;
use crate::lockfile::ReleasePin;
use crate::model::{Declaration, Value};
use crate::paths::Paths;
use crate::util::proc::{bounded_output, bounded_stdout};

/// A release lookup is one small JSON answer; a minute covers a slow
/// network without hiding an outage.
const API_DEADLINE: Duration = Duration::from_mins(1);
/// Binaries run to tens of megabytes; ten minutes covers a slow line,
/// and a stalled download past that is dead, not slow.
const DOWNLOAD_DEADLINE: Duration = Duration::from_mins(10);

/// Where release binaries land.
pub fn bin_dir(paths: &Paths) -> PathBuf {
    paths.home.join(".local/bin")
}

/// Ask the API for the latest release and hash its matching asset:
/// the resolution `niwa update` records.
pub fn resolve(repo: &str) -> Result<ReleasePin, Error> {
    let (version, asset_url) = latest_asset(repo)?;
    let temp = tempdir_file(repo)?;
    download(&asset_url, &temp)?;
    let bytes = std::fs::read(&temp).map_err(|error| release_error(repo, &error))?;
    discard(&temp);
    Ok(ReleasePin {
        version,
        sha256: digest(&bytes),
    })
}

/// Download, verify against the pin, and install the named binary.
pub fn install(paths: &Paths, repo: &str, bin: &str, pin: &ReleasePin) -> Result<(), Error> {
    // A prefetched asset is already the locked bytes; the digest
    // gate below re-proves it either way.
    let cached = cache_path(paths, pin);
    let temp = if cached.is_file() {
        cached
    } else {
        let (version, asset_url) = latest_asset(repo)?;
        if version != pin.version {
            return Err(Error::Apply {
                doing: format!("installing {repo}"),
                detail: format!(
                    "upstream now serves {version}, the lock pins {} · run `niwa update {repo}` to move deliberately",
                    pin.version
                ),
            });
        }
        let temp = tempdir_file(repo)?;
        download(&asset_url, &temp)?;
        temp
    };
    let bytes = std::fs::read(&temp).map_err(|error| release_error(repo, &error))?;
    if digest(&bytes) != pin.sha256 {
        discard(&temp);
        return Err(Error::Apply {
            doing: format!("installing {repo}"),
            detail: "the downloaded asset does not match the locked sha256; refusing it"
                .to_string(),
        });
    }

    let target_dir = bin_dir(paths);
    std::fs::create_dir_all(&target_dir).map_err(|error| release_error(repo, &error))?;
    let target = target_dir.join(bin);

    // Content decides the unpack: release assets are tarballs or
    // bare binaries, and the gzip magic is truer than a file name.
    // Either way the binary lands whole and executable in one
    // rename — a crash never leaves a torn half on the PATH.
    if bytes.starts_with(&[0x1f, 0x8b]) {
        extract_binary(repo, &temp, bin, &target)?;
    } else {
        crate::util::write_atomic(&target, &bytes, Some(0o755), false)
            .map_err(|error| release_error(repo, &error))?;
    }
    discard(&temp);
    Ok(())
}

/// The binary a release declaration installs: its `bin` field, or
/// the repo's own name.
pub fn bin_of(declaration: &Declaration) -> String {
    bin_of_spec(&declaration.spec, &declaration.identity.key)
}

/// The same rule from a bare spec: the `bin` field, or the repo's
/// tail — orphan handling has the acknowledgement, not a declaration.
pub fn bin_of_spec(spec: &Value, repo: &str) -> String {
    if let Value::Map(fields) = spec
        && let Some(Value::Str(bin)) = fields.get("bin")
    {
        return bin.clone();
    }
    repo.rsplit('/').next().unwrap_or(repo).to_string()
}

/// Where a prefetched asset waits, named by its locked digest: a
/// cache hit is verified content by construction.
fn cache_path(paths: &Paths, pin: &ReleasePin) -> std::path::PathBuf {
    paths.state.join("cache").join(&pin.sha256)
}

/// Fetch the pinned asset into the cache, for the background
/// prefetch. Best effort by design: any miss just means the install
/// downloads for itself, in program order.
pub fn prefetch(paths: &Paths, repo: &str, pin: &ReleasePin) {
    let target = cache_path(paths, pin);
    if target.is_file() {
        return;
    }
    let Ok((version, asset_url)) = latest_asset(repo) else {
        return;
    };
    if version != pin.version {
        return;
    }
    let Ok(temp) = tempdir_file(&format!("{repo}-prefetch")) else {
        return;
    };
    if download(&asset_url, &temp).is_err() {
        discard(&temp);
        return;
    }
    let Ok(bytes) = std::fs::read(&temp) else {
        discard(&temp);
        return;
    };
    if digest(&bytes) != pin.sha256 {
        discard(&temp);
        return;
    }
    // The rename is the atom: a torn prefetch never becomes a hit;
    // the scratch directory leaves with the asset either way.
    if let Some(parent) = target.parent()
        && std::fs::create_dir_all(parent).is_ok()
    {
        let _ = std::fs::rename(&temp, &target);
    }
    discard(&temp);
}

/// One fetch of the latest-release document, shared by every
/// question asked of it.
fn latest_release(repo: &str) -> Result<serde_json::Value, Error> {
    let url = format!("https://api.github.com/repos/{repo}/releases/latest");
    let body =
        bounded_stdout("curl", &["-fsSL", &url], API_DEADLINE).ok_or_else(|| Error::Apply {
            doing: format!("resolving {repo}"),
            detail: "the release API did not answer".to_string(),
        })?;
    serde_json::from_str(&body).map_err(|error| release_error(repo, &error))
}

/// The newest version upstream serves, for the outdated count.
pub fn latest_version(repo: &str) -> Option<String> {
    let release = latest_release(repo).ok()?;
    release
        .get("tag_name")
        .and_then(|tag| tag.as_str())
        .map(|tag| tag.trim_start_matches('v').to_string())
}

/// The latest release's version and the one asset built for this
/// machine.
fn latest_asset(repo: &str) -> Result<(String, String), Error> {
    let release = latest_release(repo)?;
    let version = release
        .get("tag_name")
        .and_then(|tag| tag.as_str())
        .map(|tag| tag.trim_start_matches('v').to_string())
        .ok_or_else(|| Error::Apply {
            doing: format!("resolving {repo}"),
            detail: "the release carries no tag".to_string(),
        })?;

    let assets = release
        .get("assets")
        .and_then(|assets| assets.as_array())
        .cloned()
        .unwrap_or_default();
    let mut names = Vec::new();
    for asset in &assets {
        let name = asset
            .get("name")
            .and_then(|name| name.as_str())
            .unwrap_or("");
        names.push(name.to_string());
        if fits_this_machine(name)
            && let Some(url) = asset
                .get("browser_download_url")
                .and_then(|url| url.as_str())
        {
            return Ok((version, url.to_string()));
        }
    }
    Err(Error::Apply {
        doing: format!("resolving {repo}"),
        detail: format!(
            "no asset reads as macOS on this architecture; upstream offers: {}",
            names.join(", ")
        ),
    })
}

/// Does an asset name read as this platform?
fn fits_this_machine(name: &str) -> bool {
    let lower = name.to_lowercase();
    let os = lower.contains("darwin") || lower.contains("macos") || lower.contains("apple");
    let arch = if cfg!(target_arch = "aarch64") {
        lower.contains("arm64") || lower.contains("aarch64")
    } else {
        lower.contains("x86_64") || lower.contains("amd64")
    };
    os && arch
}

fn download(url: &str, to: &Path) -> Result<(), Error> {
    let to_text = to.display().to_string();
    let finished = bounded_output(
        "curl",
        &["-fsSL", "--output", &to_text, url],
        DOWNLOAD_DEADLINE,
    );
    match finished {
        Some(finished) if finished.code == Some(0) => Ok(()),
        Some(finished) => Err(Error::Apply {
            doing: format!("downloading {url}"),
            detail: finished.stderr_tail,
        }),
        None => Err(Error::Apply {
            doing: format!("downloading {url}"),
            detail: "curl did not finish inside the deadline, or is not installed".to_string(),
        }),
    }
}

/// Pull one named binary out of a tarball.
fn extract_binary(repo: &str, archive: &Path, bin: &str, target: &Path) -> Result<(), Error> {
    let unpack = archive.with_extension("unpack");
    std::fs::create_dir_all(&unpack).map_err(|error| release_error(repo, &error))?;
    let archive_text = archive.display().to_string();
    let unpack_text = unpack.display().to_string();
    let finished = bounded_output(
        "tar",
        &["-xzf", &archive_text, "-C", &unpack_text],
        DOWNLOAD_DEADLINE,
    );
    if finished.is_none_or(|finished| finished.code != Some(0)) {
        return Err(Error::Apply {
            doing: format!("unpacking {repo}"),
            detail: "tar could not unpack the asset".to_string(),
        });
    }
    let found = find_file(&unpack, bin).ok_or_else(|| Error::Apply {
        doing: format!("unpacking {repo}"),
        detail: format!("the asset holds no file named {bin}"),
    })?;
    let bytes = std::fs::read(&found).map_err(|error| release_error(repo, &error))?;
    crate::util::write_atomic(target, &bytes, Some(0o755), false)
        .map_err(|error| release_error(repo, &error))?;
    let _ = std::fs::remove_dir_all(&unpack);
    Ok(())
}

fn find_file(dir: &Path, name: &str) -> Option<PathBuf> {
    let entries = std::fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        // The file type comes from the directory entry, never a
        // stat that follows symlinks: an archive carrying a link to
        // `/` or its own parent must not recurse through it.
        let kind = entry.file_type().ok()?;
        if kind.is_dir() {
            if let Some(found) = find_file(&path, name) {
                return Some(found);
            }
        } else if kind.is_file() && path.file_name().is_some_and(|file| file == name) {
            return Some(path);
        }
    }
    None
}

/// A private scratch file for one download: its parent directory is
/// created fresh and exclusively (0700), so no other user can
/// pre-plant a path for curl or tar to write through.
fn tempdir_file(repo: &str) -> Result<PathBuf, Error> {
    use std::os::unix::fs::PermissionsExt as _;
    let base = std::env::temp_dir();
    for attempt in 0..1024u32 {
        let dir = base.join(format!("niwa-release-{}-{attempt}", std::process::id()));
        match std::fs::create_dir(&dir) {
            Ok(()) => {
                let _ = std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700));
                return Ok(dir.join(repo.replace('/', "-")));
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(error) => return Err(release_error(repo, &error)),
        }
    }
    Err(release_error(
        repo,
        &"no free scratch directory under the system temp",
    ))
}

/// Drop one scratch file and the private directory around it. A
/// cache hit hands in a path under the prefetch cache instead; that
/// one stays — the cache is the point of it.
fn discard(temp: &std::path::Path) {
    let scratch = temp
        .parent()
        .and_then(|parent| parent.file_name())
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.starts_with("niwa-release-"));
    if scratch && let Some(parent) = temp.parent() {
        let _ = std::fs::remove_dir_all(parent);
    }
}

fn release_error(repo: &str, error: &dyn std::fmt::Display) -> Error {
    Error::apply(format!("installing {repo}"), error)
}

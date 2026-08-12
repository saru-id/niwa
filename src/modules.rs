//! Shared modules: `niwa.use("github:owner/repo@ref")`, resolved and
//! hashed in the lockfile, cached by content, sandboxed exactly like
//! your own code.
//!
//! Resolution clones the ref shallowly, records the commit, hashes
//! the tree deterministically, and caches it under that hash in the
//! data directory. Loading reads only the cache: a plan never
//! touches the network. This build loads a shared module's
//! `init.luau`; internal requires inside shared modules come later.

use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::error::Error;
use crate::journal::digest;
use crate::lockfile::UsePin;
use crate::paths::Paths;
use crate::util::proc::bounded_output;

const GIT_DEADLINE: Duration = Duration::from_mins(5);

/// Where resolved modules live, by tree hash.
pub fn cache_dir(paths: &Paths, sha256: &str) -> PathBuf {
    paths.data.join("niwa/modules").join(sha256)
}

/// Clone the ref, hash the tree, fill the cache, and report the pin.
pub fn resolve(paths: &Paths, source: &str, reference: &str) -> Result<UsePin, Error> {
    let repo = source.strip_prefix("github:").unwrap_or(source);
    let url = format!("https://github.com/{repo}.git");
    let checkout = std::env::temp_dir().join(format!(
        "niwa-use-{}-{}",
        repo.replace('/', "-"),
        std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&checkout);
    let checkout_text = checkout.display().to_string();

    let cloned = bounded_output(
        "git",
        &[
            "clone",
            "--quiet",
            "--depth",
            "1",
            "--branch",
            reference,
            &url,
            &checkout_text,
        ],
        GIT_DEADLINE,
    );
    if cloned.is_none_or(|finished| finished.code != Some(0)) {
        return Err(Error::Apply {
            doing: format!("resolving {source}"),
            detail: format!("git could not fetch {reference} from {url}"),
        });
    }

    let commit = crate::util::proc::bounded_stdout(
        "git",
        &["-C", &checkout_text, "rev-parse", "--short", "HEAD"],
        GIT_DEADLINE,
    )
    .unwrap_or_default();

    let tree = hash_tree(&checkout);
    let cache = cache_dir(paths, &tree);
    if !cache.exists() {
        std::fs::create_dir_all(cache.parent().unwrap_or(&paths.data)).map_err(|error| {
            Error::Apply {
                doing: format!("caching {source}"),
                detail: error.to_string(),
            }
        })?;
        copy_tree(&checkout, &cache)?;
    }
    let _ = std::fs::remove_dir_all(&checkout);

    Ok(UsePin {
        reference: reference.to_string(),
        commit,
        sha256: tree,
    })
}

/// A deterministic digest over the tree: sorted relative paths and
/// their bytes, `.git` excluded.
fn hash_tree(root: &Path) -> String {
    let mut files = Vec::new();
    collect(root, Path::new(""), &mut files);
    files.sort();
    let mut everything = Vec::new();
    for relative in files {
        everything.extend_from_slice(relative.display().to_string().as_bytes());
        everything.push(0);
        if let Ok(bytes) = std::fs::read(root.join(&relative)) {
            everything.extend_from_slice(&bytes);
        }
        everything.push(0);
    }
    digest(&everything)
}

fn collect(root: &Path, prefix: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(root.join(prefix)) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name();
        if name == ".git" {
            continue;
        }
        let relative = prefix.join(&name);
        if entry.path().is_dir() {
            collect(root, &relative, out);
        } else {
            out.push(relative);
        }
    }
}

fn copy_tree(from: &Path, to: &Path) -> Result<(), Error> {
    let mut files = Vec::new();
    collect(from, Path::new(""), &mut files);
    for relative in files {
        let source = from.join(&relative);
        let target = to.join(&relative);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|error| Error::apply("caching the module", error))?;
        }
        std::fs::copy(&source, &target)
            .map_err(|error| Error::apply("caching the module", error))?;
    }
    Ok(())
}

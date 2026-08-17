#!/bin/sh
# Builds the two macOS release archives and verifies them the way
# `install.sh` verifies a download.
#
# Usage: sh .github/scripts/release-package.sh <version> <outdir>
#
# It runs from the repository root, because that is where cargo finds the
# crate.

set -eu

VERSION="${1:?name the version to package}"
OUTDIR="${2:?name the directory the artifacts go in}"

fail() { printf 'release-package: %s\n' "$*" >&2; exit 1; }

# The caller owns this path and a fresh job has none of it. The archives are
# written from other directories, so it is resolved once to an absolute path.
mkdir -p "$OUTDIR"
OUTDIR="$(cd "$OUTDIR" && pwd)"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Build into a scratch target directory, so the packaged binary is the one this
# run compiled and never a file left behind in the checkout's `target/`.
BUILD="$WORK/target"

# The two arch tokens are the two `uname -m` prints on macOS. `install.sh`
# interpolates that print into the file name and the site worker redirects the
# same two tokens, so each Rust target maps to one of these names and no other.
package() {
    target="$1"
    arch="$2"
    name="niwa-$VERSION-macos-$arch.tar.gz"

    # The lockfile is the dependency set the release is built from. A build
    # that would rewrite it fails instead.
    CARGO_TARGET_DIR="$BUILD" cargo build --release --locked --target "$target"
    built="$BUILD/$target/release/niwa"

    # An Apple silicon runner has no Rosetta, so the x86_64 binary is never
    # executed here. lipo is what proves which machine it is for.
    archs="$(lipo -archs "$built")"
    [ "$archs" = "$arch" ] || fail "$target built $archs, not $arch"

    stage="$WORK/stage-$arch"
    mkdir -p "$stage"
    cp "$built" "$stage/niwa"

    # The arm64 binary is native here, so its own reported version must match
    # the name it ships under. The x86_64 binary cannot run on this runner.
    if [ "$arch" = "arm64" ]; then
        reported="$("$stage/niwa" --version)"
        [ "$reported" = "niwa $VERSION" ] \
            || fail "the built binary reports \"$reported\", not niwa $VERSION"
    fi

    (cd "$stage" && COPYFILE_DISABLE=1 tar --no-mac-metadata --uid 0 --gid 0 -czf "$OUTDIR/$name" niwa)

    listing="$(tar -tzf "$OUTDIR/$name")"
    [ "$listing" = "niwa" ] || fail "$name holds $listing, not one file named niwa"

    # `install.sh` runs `shasum -c` in a directory holding only the two files
    # it downloaded, so the checksum names the file with no path in front of it.
    (cd "$OUTDIR" && shasum -a 256 "$name" >"$name.sha256")

    # The check runs in a directory holding the pair and nothing else, which is
    # the geometry every install has.
    check="$WORK/check-$arch"
    mkdir -p "$check"
    cp "$OUTDIR/$name" "$OUTDIR/$name.sha256" "$check"
    (cd "$check" && shasum -a 256 -c "$name.sha256" --status) \
        || fail "$name does not match the checksum written beside it"
}

package aarch64-apple-darwin arm64
package x86_64-apple-darwin x86_64

# The count is a statement about the whole directory. An artifact of another
# version left in it fails the release instead of riding along with it.
set -- "$OUTDIR"/*
[ "$#" -eq 4 ] || fail "$OUTDIR holds $# files, not the four release artifacts"

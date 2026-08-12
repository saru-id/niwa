#!/bin/sh
# The niwa installer: `curl -fsSL niwa.rs | sh`.
#
# It needs nothing preinstalled. It verifies the release checksum
# before touching anything, installs one binary under ~/.local/bin,
# wires PATH exactly once, and is idempotent: running it again
# replaces the binary and changes nothing else.
#
# NIWA_RELEASE_BASE overrides where releases are fetched from, for
# mirrors and for testing. NIWA_VERSION pins a version.

set -eu

BASE="${NIWA_RELEASE_BASE:-https://niwa.rs/release}"
VERSION="${NIWA_VERSION:-0.1.0}"
ARCH="$(uname -m)"
NAME="niwa-$VERSION-macos-$ARCH.tar.gz"

say() { printf '%s\n' "$*"; }
fail() { printf 'install: %s\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || fail "niwa is a macOS tool; this is $(uname -s)"

# The Command Line Tools carry git, which the config repo needs.
# Trigger the OS install and wait for the person to finish it.
if ! xcode-select -p >/dev/null 2>&1; then
    say "the Command Line Tools are needed first; macOS will ask"
    xcode-select --install >/dev/null 2>&1 || true
    until xcode-select -p >/dev/null 2>&1; do sleep 10; done
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

say "fetching $NAME"
curl -fsSL --max-time 300 "$BASE/$NAME" -o "$WORK/$NAME" \
    || fail "cannot fetch $BASE/$NAME"
curl -fsSL --max-time 60 "$BASE/$NAME.sha256" -o "$WORK/$NAME.sha256" \
    || fail "cannot fetch the checksum beside it"

# The checksum gates everything: a mismatch means the download is not
# the release, and nothing on this machine changes.
(cd "$WORK" && shasum -a 256 -c "$NAME.sha256" --status) \
    || fail "the checksum does not match; nothing was installed"

tar -xzf "$WORK/$NAME" -C "$WORK" niwa
mkdir -p "$HOME/.local/bin"
chmod 755 "$WORK/niwa"
mv -f "$WORK/niwa" "$HOME/.local/bin/niwa"
say "niwa $VERSION is at ~/.local/bin/niwa"

# PATH, exactly once: the marker comment is the guard, so re-running
# never stacks a second line.
RC="${ZDOTDIR:-$HOME}/.zshrc"
if ! grep -qs '# added by niwa' "$RC"; then
    printf '\nexport PATH="$HOME/.local/bin:$PATH" # added by niwa\n' >>"$RC"
    say "PATH is wired in ${RC#"$HOME"/}"
fi

say "next: open a new shell and run \`niwa init\`"

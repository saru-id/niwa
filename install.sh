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

main() {
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
    # One hour covers any real install; a canceled dialog must not
    # poll forever.
    waited=0
    until xcode-select -p >/dev/null 2>&1; do
        sleep 10
        waited=$((waited + 10))
        [ "$waited" -ge 3600 ] && fail "the Command Line Tools did not finish installing; run the installer again once they are in"
    done
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

# With a config repo named, the second-machine walk starts here:
# clone, then the person restores the sealing key (one passphrase),
# reads the plan, and applies. Without one, init starts fresh.
CONFIG_REPO="${1:-}"
if [ -n "$CONFIG_REPO" ]; then
    if [ -e "$HOME/.config/niwa/init.luau" ]; then
        say "a config already lives at ~/.config/niwa · leaving it"
    else
        mkdir -p "$HOME/.config"
        git clone -q "$CONFIG_REPO" "$HOME/.config/niwa" \
            || fail "cannot clone $CONFIG_REPO"
        say "your config is at ~/.config/niwa"
    fi
    say "next, in a new shell:"
    say "  niwa seal-key restore   # one passphrase, if you seal secrets"
    say "  niwa plan               # read what apply would do"
    say "  niwa apply              # the checklist prints at the top"
else
    say "next: open a new shell and run \`niwa init\`"
fi
}

# The whole script parses before one line runs: a connection that
# drops mid-download executes nothing, instead of a prefix.
main "$@"

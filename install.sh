#!/bin/sh
# The niwa installer: `curl -fsSL niwa.rs | sh -s -- --config github:you/dotfiles`.
#
# It needs nothing preinstalled. It verifies the release checksum
# before touching anything, installs one binary under ~/.local/bin,
# wires PATH exactly once, and is idempotent: running it again
# replaces the binary and changes nothing else.
#
# With a config and a terminal it walks on: the sealing key, then the
# attended apply. With no terminal it prints those steps instead.
#
# NIWA_RELEASE_BASE overrides where releases are fetched from, for
# mirrors and for testing. NIWA_VERSION pins a version.

set -eu

main() {
    BASE="${NIWA_RELEASE_BASE:-https://niwa.rs/release}"
VERSION="${NIWA_VERSION:-0.1.2}"
ARCH="$(uname -m)"
NAME="niwa-$VERSION-macos-$ARCH.tar.gz"

say() { printf '%s\n' "$*"; }
fail() { printf 'install: %s\n' "$*" >&2; exit 1; }

# The one argument, in the one documented shape. A misspelling must
# cost nothing, so this runs before anything is fetched or changed.
[ "$#" -eq 0 ] || { [ "$#" -eq 2 ] && [ "$1" = "--config" ] && [ -n "$2" ]; } \
    || fail "name the config repository with --config, for example --config github:you/dotfiles"
CONFIG="${2:-}"

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

CONFIG_DIR="$HOME/.config/niwa"
if [ -n "$CONFIG" ]; then
    if [ -e "$CONFIG_DIR/init.luau" ]; then
        say "a config already lives at ~/.config/niwa · leaving it"
    else
        # `github:owner/repo@ref` is the shorthand `niwa.use` speaks
        # inside the config, expanded the same way here so both
        # surfaces share one language. Any other ref, an https or ssh
        # URL or a path, reaches git as written.
        URL="$CONFIG"
        REV=""
        case "$CONFIG" in
        github:*)
            REPO="${CONFIG#github:}"
            case "$REPO" in
            *@*) REV="${REPO#*@}"; REPO="${REPO%%@*}" ;;
            esac
            URL="https://github.com/$REPO.git"
            ;;
        esac
        mkdir -p "$HOME/.config"
        git clone -q "$URL" "$CONFIG_DIR" || fail "cannot clone $URL"
        [ -z "$REV" ] || git -C "$CONFIG_DIR" checkout -q "$REV" \
            || fail "$URL holds no $REV; the clone is at ~/.config/niwa, so check out a ref you have and run \`niwa apply\`"
        say "your config is at ~/.config/niwa"
    fi
fi

# The walk goes on when a config is in place and /dev/tty opens: the
# node stays readable with no terminal behind it, so opening it is
# the honest test. The pipe of `curl | sh` owns stdin, so the two
# children that ask read /dev/tty. PATH here is still the old one.
if [ -e "$CONFIG_DIR/init.luau" ]; then
    if (: </dev/tty) 2>/dev/null; then
        # The escrow is the file `seal-key restore` reads; without it
        # the passphrase would be a question with no answer.
        if [ -f "$CONFIG_DIR/secrets/seal-key.age" ]; then
            "$HOME/.local/bin/niwa" seal-key restore </dev/tty \
                || fail "the sealing key is not restored; niwa and your config are in place, so run \`niwa seal-key restore\`, then \`niwa apply\`"
        fi
        # The attended apply shows the plan, asks once, and prints
        # the checklist at the top. None of that belongs here twice.
        "$HOME/.local/bin/niwa" apply </dev/tty
    else
        say "next, in a new shell:"
        say "  niwa seal-key restore   # one passphrase, if you seal secrets"
        say "  niwa plan               # read what apply would do"
        say "  niwa apply              # the checklist prints at the top"
    fi
else
    say "next: open a new shell and run \`niwa init\`"
fi
}

# The whole script parses before one line runs: a connection that
# drops mid-download executes nothing, instead of a prefix.
main "$@"

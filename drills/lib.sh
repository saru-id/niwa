# Shared helpers for drills. Every drill is a hermetic end-to-end
# scenario: a throwaway home, the real binary, numbered self-checking
# steps, and assertions on files and exit codes.
#
# Drills never touch the real home, real preferences, real services,
# or real package managers. Every spawned process has a deadline.

set -eu

: "${NIWA_BIN:?NIWA_BIN must point at the built niwa binary}"

# The host's environment never reaches a drill. Everything outside
# this allowlist is dropped, so no stray variable (ZDOTDIR, GIT_*,
# XDG_*, HOMEBREW_*) can point a tool at the real machine.
for var in $(env | sed -n 's/^\([A-Za-z_][A-Za-z0-9_]*\)=.*/\1/p'); do
    case "$var" in
    HOME | PATH | PWD | TERM | LANG | TMPDIR | SHLVL | _ | NIWA_BIN | LLVM_PROFILE_FILE) ;;
    *) unset "$var" 2>/dev/null || true ;;
    esac
done

SANDBOX="$(mktemp -d)"
export HOME="$SANDBOX/home"
mkdir -p "$HOME"

# Default stubs for every tool that could reach the real machine. A
# drill that forgets to stub one of these must hit a harmless no-op,
# never the real thing. Drills prepend their own bin to override.
STUBS="$SANDBOX/stubs"
mkdir -p "$STUBS"
for tool in killall launchctl osascript ioreg; do
    printf '#!/bin/sh\necho "%s $*" >>"%s/system.log"\nexit 0\n' \
        "$tool" "$SANDBOX" >"$STUBS/$tool"
    chmod 755 "$STUBS/$tool"
done
export PATH="$STUBS:/usr/bin:/bin"

cleanup() { rm -rf "$SANDBOX"; }
trap cleanup EXIT

# niwa <args...>: run the binary against the sandbox with a hard
# deadline; the exit code lands in $STATUS without tripping set -e.
# The deadline is perl's alarm, because macOS ships no timeout tool.
niwa() {
    STATUS=0
    /usr/bin/perl -e 'alarm shift; exec @ARGV or die "exec: $!"' 60 \
        "$NIWA_BIN" "$@" >"$SANDBOX/stdout" 2>"$SANDBOX/stderr" || STATUS=$?
}

# check <number> <description> <command...>: one numbered assertion.
check() {
    number="$1"; description="$2"; shift 2
    if "$@"; then
        echo "  ok $number · $description"
    else
        echo "  FAIL $number · $description" >&2
        echo "  --- stdout ---" >&2; cat "$SANDBOX/stdout" >&2 2>/dev/null || true
        echo "  --- stderr ---" >&2; cat "$SANDBOX/stderr" >&2 2>/dev/null || true
        exit 1
    fi
}

config() { mkdir -p "$HOME/.config/niwa"; }

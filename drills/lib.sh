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

# An instrumented binary without a profile path drops default_*.profraw
# into the working directory; aim strays at the sandbox instead.
export LLVM_PROFILE_FILE="${LLVM_PROFILE_FILE:-$SANDBOX/%p-%m.profraw}"

# Managed preferences resolve into the sandbox too; the real
# machine's configuration profiles must never shape a drill.
export NIWA_MANAGED_PREFS="$SANDBOX/managed"
mkdir -p "$NIWA_MANAGED_PREFS"

# Homebrew resolves into the sandbox by default; the real Cellar must
# never answer a drill's survey. Drills that stub brew re-export the
# same value.
export HOMEBREW_PREFIX="$SANDBOX/brew"
mkdir -p "$HOMEBREW_PREFIX/Cellar" "$HOMEBREW_PREFIX/Caskroom"

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
# security answers "item not found"; the real keychain never hears
# from a drill. Drills proving keychain behavior write their own.
printf '#!/bin/sh\necho "security $*" >>"%s/system.log"\nexit 44\n' \
    "$SANDBOX" >"$STUBS/security"
chmod 755 "$STUBS/security"
export PATH="$STUBS:/usr/bin:/bin"

cleanup() { rm -rf "$SANDBOX"; }
trap cleanup EXIT

# stub_brew [logfile]: the one general-purpose brew. Lays receipts in
# the sandbox prefix for install (formulae and casks in their own
# rooms), removes them for uninstall, and answers brew services with
# an agent plist. Drills proving brew-specific behavior (failure
# shapes, outdated, slowness) write their own stub instead.
stub_brew() {
    _brewlog="${1:-$SANDBOX/brew.log}"
    BIN="$SANDBOX/bin"
    mkdir -p "$BIN" "$HOMEBREW_PREFIX/Cellar" "$HOMEBREW_PREFIX/Caskroom"
    cat >"$BIN/brew" <<BREW_STUB
#!/bin/sh
echo "brew \$*" >>"$_brewlog"
case "\$1" in
install)
    shift
    kind="Cellar"
    for name in "\$@"; do
        if [ "\$name" = "--cask" ]; then kind="Caskroom"; continue; fi
        mkdir -p "$HOMEBREW_PREFIX/\$kind/\$name/1.0.0"
        [ "\$kind" = "Cellar" ] && echo '{"installed_on_request":true}' \
            >"$HOMEBREW_PREFIX/Cellar/\$name/1.0.0/INSTALL_RECEIPT.json"
    done
    ;;
uninstall)
    shift
    kind="Cellar"
    for name in "\$@"; do
        if [ "\$name" = "--cask" ]; then kind="Caskroom"; continue; fi
        rm -rf "$HOMEBREW_PREFIX/\$kind/\$name"
    done
    ;;
services)
    if [ "\$2" = "start" ]; then
        mkdir -p "$HOME/Library/LaunchAgents"
        printf '<?xml version="1.0"?><plist version="1.0"><dict/></plist>' \
            >"$HOME/Library/LaunchAgents/homebrew.mxcl.\$3.plist"
    elif [ "\$2" = "stop" ]; then
        rm -f "$HOME/Library/LaunchAgents/homebrew.mxcl.\$3.plist"
    fi
    ;;
esac
exit 0
BREW_STUB
    chmod 755 "$BIN/brew"
}

# bounded <seconds> <command...>: a hard deadline for anything a
# drill runs outside the niwa() wrapper (pseudo-tty walks, the
# installer). macOS ships no timeout tool; perl's alarm serves.
bounded() {
    _limit="$1"
    shift
    /usr/bin/perl -e 'alarm shift; exec @ARGV or die "exec: $!"' "$_limit" "$@"
}

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

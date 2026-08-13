#!/bin/sh
# Drill: day one, on the release artifact.
#
# The tarball is built from the real binary, served by a stub curl,
# and installed by the real installer into a clean home. The checksum
# gates the install, PATH is wired exactly once, a second run changes
# nothing, and the installed binary bootstraps the machine from
# nothing: init, apply, verify.

. "$(dirname "$0")/lib.sh"

echo "drill: day one"

BIN="$SANDBOX/bin"
mkdir -p "$BIN"

# --- the release artifact, from the binary under test ---------------
ARCH="$(uname -m)"
NAME="niwa-0.1.0-macos-$ARCH.tar.gz"
RELEASE="$SANDBOX/release"
mkdir -p "$RELEASE"
cp "$NIWA_BIN" "$SANDBOX/niwa"
tar -czf "$RELEASE/$NAME" -C "$SANDBOX" niwa
rm "$SANDBOX/niwa"
(cd "$RELEASE" && shasum -a 256 "$NAME" >"$NAME.sha256")

# A stub curl serves files out of the release directory and logs the
# URLs it was asked for. A stub xcode-select reports the tools ready.
cat >"$BIN/curl" <<EOF
#!/bin/sh
url=""; target=""
while [ \$# -gt 0 ]; do
    case "\$1" in
    -o) target="\$2"; shift ;;
    -*) ;;
    *) url="\$1" ;;
    esac
    shift
done
echo "\$url" >>"$SANDBOX/curl.log"
cp "$RELEASE/\$(basename "\$url")" "\$target" 2>/dev/null || exit 22
EOF
chmod 755 "$BIN/curl"
# Stateful: the tools are missing until --install is asked for, so
# the installer's trigger-and-wait branch actually runs.
cat >"$BIN/xcode-select" <<EOF
#!/bin/sh
STATE="$SANDBOX/clt-state"
case "\$1" in
--install) touch "\$STATE"; exit 0 ;;
-p)
    [ -f "\$STATE" ] && { echo "/Library/Developer/CommandLineTools"; exit 0; }
    exit 2
    ;;
esac
exit 0
EOF
chmod 755 "$BIN/xcode-select"
cat >"$BIN/scutil" <<'EOF'
#!/bin/sh
echo "dayone"
EOF
chmod 755 "$BIN/scutil"
export PATH="$BIN:$STUBS:/usr/bin:/bin"

INSTALLER="$(dirname "$0")/../install.sh"

# headless <seconds> <command...>: the day one rehearsal's shape. The
# session is dropped, so no controlling terminal remains and the
# installer cannot open /dev/tty. macOS ships no setsid; perl's
# serves, and a session that will not drop must be loud rather than a
# silently attended run.
headless() {
    /usr/bin/perl -e 'use POSIX; die "setsid: $!" unless POSIX::setsid() > 0;
        alarm shift; exec @ARGV or die "exec: $!"' "$@"
}

# commit_in <repo> <message>: one commit, fixed identity, no signing.
commit_in() {
    git -C "$1" -c user.name=drill -c user.email=drill@test \
        -c commit.gpgsign=false add -A
    git -C "$1" -c user.name=drill -c user.email=drill@test \
        -c commit.gpgsign=false commit -qm "$2"
}

# --- install: checksum first, then one binary, PATH once ------------
STATUS=0
bounded 300 sh "$INSTALLER" >"$SANDBOX/stdout" 2>"$SANDBOX/stderr" || STATUS=$?
check 1 "the installer succeeds (exit 0)" test "$STATUS" -eq 0
check 2 "the binary landed in ~/.local/bin" test -x "$HOME/.local/bin/niwa"
check 2b "the missing tools were triggered, then waited for" \
    test -f "$SANDBOX/clt-state"
check 3 "the fetch went to the documented base for this arch" \
    grep -q "niwa.rs/release/niwa-0.1.0-macos-$ARCH.tar.gz" "$SANDBOX/curl.log"
check 4 "PATH is wired in .zshrc" grep -q "added by niwa" "$HOME/.zshrc"

STATUS=0
bounded 300 sh "$INSTALLER" >"$SANDBOX/stdout" 2>"$SANDBOX/stderr" || STATUS=$?
check 5 "a second run is idempotent (exit 0)" test "$STATUS" -eq 0
check 6 "PATH is wired exactly once" \
    test "$(grep -c 'added by niwa' "$HOME/.zshrc")" -eq 1

# --- a tampered download installs nothing ---------------------------
tar -czf "$RELEASE/$NAME" -C "$SANDBOX" stubs
BEFORE="$(shasum -a 256 "$HOME/.local/bin/niwa")"
STATUS=0
bounded 300 sh "$INSTALLER" >"$SANDBOX/stdout" 2>"$SANDBOX/stderr" || STATUS=$?
check 7 "a checksum mismatch refuses (exit 1)" test "$STATUS" -eq 1
check 8 "the refusal says nothing was installed" \
    grep -q "nothing was installed" "$SANDBOX/stderr"
check 9 "the installed binary is untouched" \
    test "$(shasum -a 256 "$HOME/.local/bin/niwa")" = "$BEFORE"

# A mirror override is part of the contract.
cp "$RELEASE/$NAME.sha256" "$SANDBOX/keep.sha256"
mkdir -p "$SANDBOX/mirror"
cp "$NIWA_BIN" "$SANDBOX/niwa"
tar -czf "$SANDBOX/mirror/$NAME" -C "$SANDBOX" niwa
rm "$SANDBOX/niwa"
(cd "$SANDBOX/mirror" && shasum -a 256 "$NAME" >"$NAME.sha256")
RELEASE_SAVE="$RELEASE"
cat >"$BIN/curl" <<EOF
#!/bin/sh
url=""; target=""
while [ \$# -gt 0 ]; do
    case "\$1" in
    -o) target="\$2"; shift ;;
    -*) ;;
    *) url="\$1" ;;
    esac
    shift
done
echo "\$url" >>"$SANDBOX/curl.log"
case "\$url" in
mirror.test/*) cp "$SANDBOX/mirror/\$(basename "\$url")" "\$target" || exit 22 ;;
*) exit 22 ;;
esac
EOF
chmod 755 "$BIN/curl"
STATUS=0
NIWA_RELEASE_BASE="mirror.test/niwa" \
    bounded 300 sh "$INSTALLER" >"$SANDBOX/stdout" 2>"$SANDBOX/stderr" || STATUS=$?
check 10 "NIWA_RELEASE_BASE redirects the fetch (exit 0)" test "$STATUS" -eq 0
check 11 "the mirror was asked, not the default" \
    grep -q "^mirror.test/niwa/$NAME\$" "$SANDBOX/curl.log"

# --- the second machine: install with a config repo -----------------
SEED="$SANDBOX/seed-repo"
mkdir -p "$SEED"
cat >"$SEED/init.luau" <<'EOF'
local niwa = require("@niwa")
niwa.file("~/.cloned", { content = "from the fleet" })
EOF
git -C "$SEED" init -q -b main
git -C "$SEED" -c user.name=drill -c user.email=drill@test \
    -c commit.gpgsign=false add -A
git -C "$SEED" -c user.name=drill -c user.email=drill@test \
    -c commit.gpgsign=false commit -qm seed

STATUS=0
NIWA_RELEASE_BASE="mirror.test/niwa" \
    headless 300 sh "$INSTALLER" --config "$SEED" \
    >"$SANDBOX/stdout" 2>"$SANDBOX/stderr" || STATUS=$?
check 11b "an installer with --config clones it (exit 0)" \
    sh -c "test $STATUS -eq 0 && test -f '$HOME/.config/niwa/init.luau'"
check 11c "headless, the walk is printed: restore, plan, apply" sh -c "
    grep -q 'seal-key restore' '$SANDBOX/stdout' &&
    grep -q 'niwa plan' '$SANDBOX/stdout'"
STATUS=0
NIWA_RELEASE_BASE="mirror.test/niwa" \
    headless 300 sh "$INSTALLER" --config "$SEED" \
    >"$SANDBOX/stdout" 2>"$SANDBOX/stderr" || STATUS=$?
check 11d "an existing config is left alone" \
    sh -c "test $STATUS -eq 0 && grep -q 'leaving it' '$SANDBOX/stdout'"
rm -rf "$HOME/.config/niwa"

# --- a truncated stream executes nothing ----------------------------
FRESH="$SANDBOX/fresh-home"
mkdir -p "$FRESH"
STATUS=0
head -c 500 "$INSTALLER" | HOME="$FRESH" sh >/dev/null 2>&1 || STATUS=$?
check 11e "a cut-off installer stream installs nothing"     sh -c "! test -e '$FRESH/.local/bin/niwa' && ! test -e '$FRESH/.zshrc'"

# --- the config argument: one shape, one shorthand ------------------
STATUS=0
NIWA_RELEASE_BASE="mirror.test/niwa" \
    headless 300 sh "$INSTALLER" "$SEED" \
    >"$SANDBOX/stdout" 2>"$SANDBOX/stderr" || STATUS=$?
check 11f "a bare positional is refused, naming --config (exit 1)" sh -c "
    test $STATUS -eq 1 &&
    grep -q -- '--config' '$SANDBOX/stderr' &&
    ! test -e '$HOME/.config/niwa'"

# The drill's git refuses every remote, so the expansion is proven by
# the URL the refusal names, with nothing reaching the network.
STATUS=0
NIWA_RELEASE_BASE="mirror.test/niwa" \
    headless 300 sh "$INSTALLER" --config github:you/dotfiles \
    >"$SANDBOX/stdout" 2>"$SANDBOX/stderr" || STATUS=$?
check 11g "github:owner/repo expands to the https clone URL (exit 1)" sh -c "
    test $STATUS -eq 1 &&
    grep -q 'cannot clone https://github.com/you/dotfiles.git\$' '$SANDBOX/stderr'"

# The same shorthand with a ref, against a git that answers only the
# expanded URL from a local repo: the URL and the checkout both hold
# without a network.
TAGGED="$SANDBOX/tagged-repo"
mkdir -p "$TAGGED"
git -C "$TAGGED" init -q -b main
printf 'local niwa = require("@niwa")\nniwa.file("~/.t", { content = "the tagged commit" })\n' \
    >"$TAGGED/init.luau"
commit_in "$TAGGED" tagged
git -C "$TAGGED" tag v1
printf 'local niwa = require("@niwa")\nniwa.file("~/.t", { content = "the main branch" })\n' \
    >"$TAGGED/init.luau"
commit_in "$TAGGED" later
cat >"$BIN/git" <<EOF
#!/bin/sh
n=\$#
while [ \$n -gt 0 ]; do
    arg="\$1"; shift
    case "\$arg" in
    https://github.com/you/dotfiles.git) arg="$TAGGED" ;;
    http://* | https://* | git@* | ssh://*)
        echo "drill git: remote clone refused: \$arg" >&2
        exit 128
        ;;
    esac
    set -- "\$@" "\$arg"
    n=\$((n - 1))
done
exec /usr/bin/git "\$@"
EOF
chmod 755 "$BIN/git"
STATUS=0
NIWA_RELEASE_BASE="mirror.test/niwa" \
    headless 300 sh "$INSTALLER" --config github:you/dotfiles@v1 \
    >"$SANDBOX/stdout" 2>"$SANDBOX/stderr" || STATUS=$?
check 11h "the @ref is checked out and is no part of the URL (exit 0)" sh -c "
    test $STATUS -eq 0 &&
    grep -q 'the tagged commit' '$HOME/.config/niwa/init.luau' &&
    ! grep -q 'the main branch' '$HOME/.config/niwa/init.luau'"
rm "$BIN/git"
rm -rf "$HOME/.config/niwa"

# --- from nothing to a governed machine -----------------------------
export HOMEBREW_PREFIX="$SANDBOX/brew"
mkdir -p "$HOMEBREW_PREFIX/Cellar"
stub_brew
export PATH="$HOME/.local/bin:$BIN:$STUBS:/usr/bin:/bin"

installed() {
    STATUS=0
    /usr/bin/perl -e 'alarm shift; exec @ARGV or die "exec: $!"' 60 \
        "$HOME/.local/bin/niwa" "$@" \
        >"$SANDBOX/stdout" 2>"$SANDBOX/stderr" || STATUS=$?
}

installed init
check 12 "the installed binary writes the starter (exit 0)" test "$STATUS" -eq 0
git -C "$HOME/.config/niwa" -c user.name=drill -c user.email=drill@test \
    -c commit.gpgsign=false add -A
git -C "$HOME/.config/niwa" -c user.name=drill -c user.email=drill@test \
    -c commit.gpgsign=false commit -qm "day one"
installed apply --yes
check 13 "the first apply converges (exit 0)" test "$STATUS" -eq 0
installed plan
check 14 "the rehearsal ends in sync (plan exit 0)" test "$STATUS" -eq 0

# --- the walk: with a terminal, the installer keeps going ------------
# The tarball decides what lands in ~/.local/bin, so the installed
# binary here records how the installer called it. `script` allocates
# the pseudo-terminal the walk needs.
cat >"$SANDBOX/niwa" <<EOF
#!/bin/sh
state="not a tty"
[ -t 0 ] && state="a tty"
echo "niwa \$* · stdin is \$state" >>"$SANDBOX/walk.log"
exit 0
EOF
chmod 755 "$SANDBOX/niwa"
tar -czf "$SANDBOX/mirror/$NAME" -C "$SANDBOX" niwa
rm "$SANDBOX/niwa"
(cd "$SANDBOX/mirror" && shasum -a 256 "$NAME" >"$NAME.sha256")

# walk_line <number> <text>: one recorded call, in the order it came.
walk_line() { test "$(sed -n "$1p" "$SANDBOX/walk.log")" = "$2"; }

rm -rf "$HOME/.config/niwa"
: >"$SANDBOX/walk.log"
STATUS=0
NIWA_RELEASE_BASE="mirror.test/niwa" \
    bounded 300 script -q /dev/null sh "$INSTALLER" --config "$SEED" \
    </dev/null >"$SANDBOX/stdout" 2>"$SANDBOX/stderr" || STATUS=$?
check 15 "with a terminal the walk applies, stdin on the tty" \
    walk_line 1 "niwa apply · stdin is a tty"
check 16 "a config that seals nothing restores no key" \
    sh -c "! grep -q 'seal-key' '$SANDBOX/walk.log'"
check 17 "the walk stands in for the printed steps (exit 0)" sh -c "
    test $STATUS -eq 0 &&
    ! grep -q 'next, in a new shell' '$SANDBOX/stdout'"

# A config that seals secrets carries the escrow `seal-key restore`
# reads; that file is the whole marker.
SEALED="$SANDBOX/sealed-repo"
mkdir -p "$SEALED/secrets"
cp "$SEED/init.luau" "$SEALED/init.luau"
printf 'age-encryption.org/v1\n' >"$SEALED/secrets/seal-key.age"
git -C "$SEALED" init -q -b main
commit_in "$SEALED" sealed

rm -rf "$HOME/.config/niwa"
: >"$SANDBOX/walk.log"
STATUS=0
NIWA_RELEASE_BASE="mirror.test/niwa" \
    bounded 300 script -q /dev/null sh "$INSTALLER" --config "$SEALED" \
    </dev/null >"$SANDBOX/stdout" 2>"$SANDBOX/stderr" || STATUS=$?
check 18 "an escrowed key is restored first, stdin on the tty" \
    walk_line 1 "niwa seal-key restore · stdin is a tty"
check 19 "and the apply follows it" walk_line 2 "niwa apply · stdin is a tty"

rm -rf "$HOME/.config/niwa"
: >"$SANDBOX/walk.log"
STATUS=0
NIWA_RELEASE_BASE="mirror.test/niwa" \
    headless 300 sh "$INSTALLER" --config "$SEED" \
    >"$SANDBOX/stdout" 2>"$SANDBOX/stderr" || STATUS=$?
check 20 "headless, nothing interactive runs (exit 0)" sh -c "
    test $STATUS -eq 0 &&
    ! test -s '$SANDBOX/walk.log' &&
    grep -q 'next, in a new shell' '$SANDBOX/stdout'"

echo "drill: day one · all checks passed"

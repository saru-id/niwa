#!/bin/sh
# Drill: the lockfile, from resolution to pinned installs.
#
# update resolves a release by tag, hashes its asset, pins a mise
# toolchain, and fetches a shared module into the content-addressed
# cache. Apply installs exactly what the lock says: the mise request
# carries the locked version, a tampered checksum is refused, and the
# shared module's declarations are real. Undo removes the binary.

. "$(dirname "$0")/lib.sh"

echo "drill: lockfile"

BIN="$SANDBOX/bin"
CALLS="$SANDBOX/calls.log"
mkdir -p "$BIN"

# --- a fake upstream: a release tarball and its API answer -----------
RELEASE="$SANDBOX/release"
mkdir -p "$RELEASE/pack"
cat >"$RELEASE/pack/lazygit" <<'EOF'
#!/bin/sh
echo "lazygit 0.44.1"
EOF
chmod 755 "$RELEASE/pack/lazygit"
tar -czf "$RELEASE/lazygit_Darwin_arm64.tar.gz" -C "$RELEASE/pack" lazygit
cat >"$RELEASE/api.json" <<EOF
{
  "tag_name": "v0.44.1",
  "assets": [
    { "name": "lazygit_Linux_x86_64.tar.gz",
      "browser_download_url": "https://example.test/linux.tar.gz" },
    { "name": "lazygit_Darwin_arm64.tar.gz",
      "browser_download_url": "https://example.test/lazygit_Darwin_arm64.tar.gz" }
  ]
}
EOF

cat >"$BIN/curl" <<EOF
#!/bin/sh
echo "curl \$*" >>"$CALLS"
out=""
url=""
while [ \$# -gt 0 ]; do
    case "\$1" in
    --output) out="\$2"; shift 2 ;;
    -*) shift ;;
    *) url="\$1"; shift ;;
    esac
done
case "\$url" in
*releases/latest) cat "$RELEASE/api.json" ;;
*Darwin_arm64.tar.gz)
    if [ -n "\$out" ]; then cp "$RELEASE/lazygit_Darwin_arm64.tar.gz" "\$out"
    else cat "$RELEASE/lazygit_Darwin_arm64.tar.gz"; fi ;;
*) exit 22 ;;
esac
EOF

cat >"$BIN/mise" <<EOF
#!/bin/sh
echo "mise \$*" >>"$CALLS"
if [ "\$1" = "latest" ]; then
    echo "22.11.0"
elif [ "\$1" = "use" ]; then
    shift; shift
    for request in "\$@"; do
        tool="\${request%%@*}"
        mkdir -p "$HOME/.local/share/mise/installs/\$tool/1.0.0"
    done
fi
exit 0
EOF

# A local "github" for the shared module: the stub git clones from it.
MODULE_SRC="$SANDBOX/module-src"
mkdir -p "$MODULE_SRC"
cat >"$MODULE_SRC/init.luau" <<'EOF'
local niwa = require("@niwa")
niwa.file("~/.from-shared-module", { content = "shared\n" })
EOF
git -C "$MODULE_SRC" init -q -b main
git -C "$MODULE_SRC" -c user.name=drill -c user.email=d@t -c commit.gpgsign=false add -A
git -C "$MODULE_SRC" -c user.name=drill -c user.email=d@t -c commit.gpgsign=false commit -qm module

cat >"$BIN/git" <<EOF
#!/bin/sh
echo "git \$*" >>"$CALLS"
# Clones ignore the URL and come from the drill's local module repo;
# everything else passes through to the real git.
if [ "\$1" = "clone" ]; then
    dest=""
    for last in "\$@"; do dest="\$last"; done
    /usr/bin/git clone --quiet "$MODULE_SRC" "\$dest"
    exit \$?
fi
exec /usr/bin/git "\$@"
EOF
chmod 755 "$BIN/curl" "$BIN/mise" "$BIN/git"
export PATH="$BIN:$STUBS:/usr/bin:/bin"

config
cat >"$HOME/.config/niwa/init.luau" <<'EOF'
local niwa = require("@niwa")
niwa.github_release { repo = "jesseduffield/lazygit", bin = "lazygit" }
niwa.mise.tool { node = "lts" }
niwa.use("github:stefan/niwa-rust@v1")
EOF

# --- unresolved is an error naming the fix, never a guess -------------
niwa plan
check 1 "an unresolved module fails the plan (exit 1)" test "$STATUS" -eq 1
check 2 "the failure names the fix" grep -q "niwa update" "$SANDBOX/stderr"

niwa update
check 3 "update resolves and writes the lock (exit 0)" test "$STATUS" -eq 0
LOCK="$HOME/.config/niwa/niwa.lock"
check 4 "the release pinned with version and sha256" \
    sh -c "grep -q '0.44.1' '$LOCK' && grep -q 'sha256' '$LOCK'"
check 5 "the toolchain pinned" grep -q "22.11.0" "$LOCK"
check 6 "the module pinned by ref and commit" \
    sh -c "grep -q 'github:stefan/niwa-rust' '$LOCK' && grep -q 'commit' '$LOCK'"

niwa update
check 7 "a second update has nothing to move (exit 0)" \
    grep -q "nothing to update" "$SANDBOX/stdout"

# --- apply installs exactly what the lock says ------------------------
niwa apply --yes
check 8 "apply succeeds against the lock (exit 0)" test "$STATUS" -eq 0
check 9 "the pinned binary landed executable" \
    test -x "$HOME/.local/bin/lazygit"
check 10 "the mise request carried the locked version, not the spec" \
    grep -q "mise use --global node@22.11.0" "$CALLS"
check 11 "the shared module's declaration was real" \
    test -f "$HOME/.from-shared-module"

niwa plan
check 12 "everything is converged (exit 0)" test "$STATUS" -eq 0

# --- a tampered checksum is refused ----------------------------------
rm "$HOME/.local/bin/lazygit"
# Zero only the release's digest; the module's cache hash must stay.
/usr/bin/perl -0pi -e 's/(\[github_release[^\[]*?sha256 = ")[0-9a-f]+/${1}0000000000000000000000000000000000000000000000000000000000000000/s' "$LOCK"

niwa apply --yes
check 13 "a checksum mismatch fails the apply (exit 1)" test "$STATUS" -eq 1
check 14 "the mismatch is named" grep -q "sha256" "$SANDBOX/stderr"
check 15 "nothing was installed" test ! -e "$HOME/.local/bin/lazygit"

niwa update
niwa apply --yes
check 16 "a fresh resolve heals the pin (exit 0)" test "$STATUS" -eq 0

# --- undo removes what the run installed ------------------------------
niwa undo --yes
check 17 "undo removes the installed binary" test ! -e "$HOME/.local/bin/lazygit"

# --- a bumped pin converges -----------------------------------------
# Reinstall the current version, then move upstream and the pin: the
# machine holds 0.44.1, the lock says 0.45.0, and apply must replace
# the binary — presence is not convergence.
niwa apply --yes
check 18 "the binary is back (exit 0)" \
    sh -c "test $STATUS -eq 0 && test -x '$HOME/.local/bin/lazygit'"
cat >"$RELEASE/pack/lazygit" <<'LUAU'
#!/bin/sh
echo "lazygit 0.45.0"
LUAU
chmod 755 "$RELEASE/pack/lazygit"
tar -czf "$RELEASE/lazygit_Darwin_arm64.tar.gz" -C "$RELEASE/pack" lazygit
/usr/bin/perl -pi -e 's/v0\.44\.1/v0.45.0/' "$RELEASE/api.json"
niwa update lazygit
check 19 "update moves the pin (exit 0)" \
    sh -c "test $STATUS -eq 0 && grep -q '0.45.0' '$HOME/.config/niwa/niwa.lock'"
niwa apply --yes
check 20 "apply converges onto the new pin (exit 0)" test "$STATUS" -eq 0
check 21 "the binary is the pinned version's bytes" \
    sh -c "'$HOME/.local/bin/lazygit' | grep -q '0.45.0'"

echo "drill: lockfile · all checks passed"

#!/bin/sh
# Drill: the example config is the acceptance suite.
#
# The design's example repo — every feature of the API in one config —
# must plan, apply, and --verify clean in a sandbox, as the machine
# named airborne. Every tool it drives is a stub; every effect it has
# is asserted on files.

. "$(dirname "$0")/lib.sh"

echo "drill: example acceptance"

export HOMEBREW_PREFIX="$SANDBOX/brew"
mkdir -p "$HOMEBREW_PREFIX/Cellar" "$HOMEBREW_PREFIX/Caskroom"
CALLS="$SANDBOX/calls.log"
BIN="$SANDBOX/bin"
NPM_ROOT="$SANDBOX/npm-root"
RELEASE="$SANDBOX/release"
mkdir -p "$BIN" "$NPM_ROOT" "$RELEASE/pack"

# --- the whole toolbox, stubbed --------------------------------------
cat >"$BIN/scutil" <<'EOF'
#!/bin/sh
echo "airborne"
EOF

cat >"$BIN/brew" <<EOF
#!/bin/sh
echo "brew \$*" >>"$CALLS"
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
services)
    if [ "\$2" = "start" ]; then
        mkdir -p "$HOME/Library/LaunchAgents"
        printf '<?xml version="1.0"?><plist version="1.0"><dict/></plist>' \
            >"$HOME/Library/LaunchAgents/homebrew.mxcl.\$3.plist"
    fi
    ;;
esac
exit 0
EOF

cat >"$BIN/npm" <<EOF
#!/bin/sh
echo "npm \$*" >>"$CALLS"
if [ "\$1" = "root" ]; then
    echo "$NPM_ROOT"
elif [ "\$1" = "install" ]; then
    shift; shift
    for name in "\$@"; do
        mkdir -p "$NPM_ROOT/\$name"
        echo '{}' >"$NPM_ROOT/\$name/package.json"
    done
fi
exit 0
EOF

cat >"$BIN/mise" <<EOF
#!/bin/sh
echo "mise \$*" >>"$CALLS"
if [ "\$1" = "latest" ]; then
    case "\$2" in
    node@*) echo "22.11.0" ;;
    rust@*) echo "1.84.1" ;;
    *) echo "1.0.0" ;;
    esac
elif [ "\$1" = "use" ]; then
    shift; shift
    for request in "\$@"; do
        tool="\${request%%@*}"
        mkdir -p "$HOME/.local/share/mise/installs/\$tool/1.0.0"
    done
fi
exit 0
EOF

cat >"$RELEASE/pack/lazygit" <<'EOF'
#!/bin/sh
echo "lazygit"
EOF
chmod 755 "$RELEASE/pack/lazygit"
tar -czf "$RELEASE/asset.tar.gz" -C "$RELEASE/pack" lazygit
cat >"$RELEASE/api.json" <<'EOF'
{ "tag_name": "v0.44.1",
  "assets": [ { "name": "lazygit_Darwin_arm64.tar.gz",
                "browser_download_url": "https://example.test/asset.tar.gz" } ] }
EOF
cat >"$BIN/curl" <<EOF
#!/bin/sh
echo "curl \$*" >>"$CALLS"
out=""; url=""
while [ \$# -gt 0 ]; do
    case "\$1" in
    --output) out="\$2"; shift 2 ;;
    -*) shift ;;
    *) url="\$1"; shift ;;
    esac
done
case "\$url" in
*releases/latest) cat "$RELEASE/api.json" ;;
*asset.tar.gz)
    if [ -n "\$out" ]; then cp "$RELEASE/asset.tar.gz" "\$out"
    else cat "$RELEASE/asset.tar.gz"; fi ;;
*) exit 22 ;;
esac
EOF

MODULE_SRC="$SANDBOX/module-src"
mkdir -p "$MODULE_SRC"
cat >"$MODULE_SRC/init.luau" <<'EOF'
local niwa = require("@niwa")
niwa.file("~/.from-niwa-rust", { content = "shared module\n" })
EOF
git -C "$MODULE_SRC" init -q -b main
git -C "$MODULE_SRC" -c user.name=d -c user.email=d@t -c commit.gpgsign=false add -A
git -C "$MODULE_SRC" -c user.name=d -c user.email=d@t -c commit.gpgsign=false commit -qm m
cat >"$BIN/git" <<EOF
#!/bin/sh
if [ "\$1" = "clone" ]; then
    echo "git \$*" >>"$CALLS"
    dest=""
    for last in "\$@"; do dest="\$last"; done
    /usr/bin/git clone --quiet "$MODULE_SRC" "\$dest"
    exit \$?
fi
exec /usr/bin/git "\$@"
EOF

cat >"$BIN/security" <<EOF
#!/bin/sh
echo "security \$*" >>"$CALLS"
case "\$*" in
*"-a github-token -w") echo "gh-token-value"; exit 0 ;;
*"-a github-token") exit 0 ;;
*) exit 44 ;;
esac
EOF

cat >"$BIN/nvim" <<EOF
#!/bin/sh
echo "nvim \$*" >>"$CALLS"
exit 0
EOF
cat >"$BIN/ssh-keygen" <<EOF
#!/bin/sh
echo "ssh-keygen \$*" >>"$CALLS"
exit 0
EOF
cat >"$BIN/softwareupdate" <<EOF
#!/bin/sh
echo "softwareupdate \$*" >>"$CALLS"
exit 0
EOF
# Stateful, like the real one: the custom kind's check reads the
# installed list, its apply moves it.
cat >"$BIN/rustup" <<EOF
#!/bin/sh
echo "rustup \$*" >>"$CALLS"
STATE="$SANDBOX/rustup-components"
case "\$1 \$2" in
"component list") cat "\$STATE" 2>/dev/null ;;
"component add") echo "\$3" >>"\$STATE" ;;
esac
exit 0
EOF

chmod 755 "$BIN"/*
export PATH="$BIN:$STUBS:/usr/bin:/bin"

# --- the example config, verbatim from the fixture --------------------
mkdir -p "$HOME/.config"
cp -R "$(dirname "$0")/../tests/fixtures/example" "$HOME/.config/niwa"
git -C "$HOME/.config/niwa" init -q -b main
git -C "$HOME/.config/niwa" -c user.name=d -c user.email=d@t -c commit.gpgsign=false add -A
git -C "$HOME/.config/niwa" -c user.name=d -c user.email=d@t -c commit.gpgsign=false commit -qm example

niwa check
check 1 "the example checks clean (exit 0)" test "$STATUS" -eq 0

niwa update
check 2 "update resolves every pin (exit 0)" test "$STATUS" -eq 0
git -C "$HOME/.config/niwa" -c user.name=d -c user.email=d@t -c commit.gpgsign=false add -A
git -C "$HOME/.config/niwa" -c user.name=d -c user.email=d@t -c commit.gpgsign=false commit -qm lock

niwa plan
check 3 "a fresh machine has pending work (exit 2)" test "$STATUS" -eq 2

niwa apply --yes --no-privileged
check 4 "the example applies clean (exit 0)" test "$STATUS" -eq 0

# The design scopes sandbox verification to the file and package
# layers: a home sandbox cannot satisfy administrator steps, nor the
# rosetta run whose guard reads an absolute /Library path. Converged
# here means nothing else remains pending — no file, package,
# preference under the home, or service.
niwa plan
check 4b "only /Library work and the rosetta run stay pending" \
    sh -c "! grep -Eq 'zshrc|starship|ghostty|netrc|brew\.formula|brew\.cask|npm:|mise:|service:|lazygit|com\.apple\.dock|com\.apple\.finder|nvim' '$SANDBOX/stdout'"

# --- what the machine now is -----------------------------------------
check 5 "the shell files landed" \
    sh -c "cmp -s '$HOME/.zshrc' '$HOME/.config/niwa/files/zshrc' && test -f '$HOME/.config/starship.toml'"
check 6 "the nvim config is a link into the repo" \
    test -L "$HOME/.config/nvim"
check 7 "the netrc rendered from the keychain, mode 600" \
    sh -c "grep -q 'password gh-token-value' '$HOME/.netrc' && test \"\$(stat -f %Lp '$HOME/.netrc')\" = '600'"
check 8 "the dock preferences landed, host override included" \
    sh -c "/usr/bin/plutil -p '$HOME/Library/Preferences/com.apple.dock.plist' | grep -q '\"autohide\" => false'"
check 9 "formulae, casks, and the host's casks installed" \
    sh -c "test -d '$HOMEBREW_PREFIX/Cellar/neovim' && test -d '$HOMEBREW_PREFIX/Caskroom/ghostty' && test -d '$HOMEBREW_PREFIX/Caskroom/steam'"
check 10 "the services are declared where launchd looks" \
    sh -c "test -f '$HOME/Library/LaunchAgents/dev.stefan.notes-sync.plist' && test -f '$HOME/Library/LaunchAgents/homebrew.mxcl.redis.plist'"
check 11 "the directory source fanned out per file" \
    sh -c "test -f '$HOME/.local/bin/notes-sync' && test -f '$HOME/.local/bin/repo-backup'"
check 12 "the pinned release binary landed" test -x "$HOME/.local/bin/lazygit"
check 13 "the shared module's declaration is real" test -f "$HOME/.from-niwa-rust"
check 13b "the custom kind's apply ran through its own handler" \
    grep -q "rust-analyzer" "$SANDBOX/rustup-components"
check 14 "the changed-gated plugin sync ran" grep -q "nvim --headless" "$CALLS"
check 15 "the once block ran its key generation" grep -q "ssh-keygen" "$CALLS"
check 16 "the stamp says airborne" test -f "$HOME/.config/niwa/state/airborne.toml"

# --- idempotence, the property everything depends on ------------------
: >"$CALLS"
niwa apply --yes --no-privileged
check 17 "a second apply succeeds (exit 0)" test "$STATUS" -eq 0
check 18 "the plugin sync did not run again" \
    sh -c "! grep -q 'nvim --headless' '$CALLS'"
check 19 "the key generation did not run again" \
    sh -c "! grep -q ssh-keygen '$CALLS'"
check 20 "no file or package moved a second time" \
    sh -c "! grep -Eq 'brew install|npm install|mise use' '$CALLS'"
check 21 "the custom kind's check now answers in sync" \
    sh -c "! grep -q 'rustup component add' '$CALLS'"

echo "drill: example acceptance · all checks passed"

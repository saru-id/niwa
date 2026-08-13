#!/bin/sh
# Drill: drift, the write-back loop, add, the watcher's voice, fmt.
#
# A governed machine drifts in every way the model names: a live file
# edit comes home, a governed preference flip becomes an in-place
# config edit, a hand-installed package becomes a proposed line placed
# in the right module, a deleted declaration becomes a removal offer,
# and a secret in a live file is held at the gate. The watcher only
# ever notifies; fmt makes machine lines and human lines one style.

. "$(dirname "$0")/lib.sh"

echo "drill: drift and pull"

export HOMEBREW_PREFIX="$SANDBOX/brew"
mkdir -p "$HOMEBREW_PREFIX/Cellar" "$HOMEBREW_PREFIX/Caskroom"
CALLS="$SANDBOX/calls.log"
BIN="$SANDBOX/bin"
mkdir -p "$BIN"
stub_brew "$CALLS"
cat >"$BIN/osascript" <<EOF
#!/bin/sh
echo "osascript \$*" >>"$CALLS"
exit 0
EOF
chmod 755 "$BIN/brew" "$BIN/osascript"
export PATH="$BIN:$STUBS:/usr/bin:/bin"

config
mkdir -p "$HOME/.config/niwa/files" "$HOME/.config/niwa/modules"
printf 'export EDITOR=nvim\n' >"$HOME/.config/niwa/files/zshrc"
cat >"$HOME/.config/niwa/modules/shell.luau" <<'EOF'
local niwa = require("@niwa")
niwa.file("~/.zshrc", { source = "@self/files/zshrc" })
EOF
cat >"$HOME/.config/niwa/modules/cli.luau" <<'EOF'
local niwa = require("@niwa")
niwa.brew.formula { "fd" }
EOF
cat >"$HOME/.config/niwa/modules/desktop.luau" <<'EOF'
local niwa = require("@niwa")
niwa.dock { autohide = true, tilesize = 48 }
EOF
cat >"$HOME/.config/niwa/init.luau" <<'EOF'
require("@self/modules/shell")
require("@self/modules/cli")
require("@self/modules/desktop")
EOF

niwa apply --yes
check 1 "the governed baseline applies (exit 0)" test "$STATUS" -eq 0

niwa pull --all
check 2 "a converged machine has nothing to pull (exit 0)" test "$STATUS" -eq 0
grep -q "nothing to pull" "$SANDBOX/stdout" || { echo "unexpected pull output" >&2; exit 1; }

# --- a live edit comes home -----------------------------------------
printf 'export EDITOR=nvim\nalias ll="eza -l"\n' >"$HOME/.zshrc"

niwa pull --all
check 3 "pull stages the live edit (exit 0)" test "$STATUS" -eq 0
check 4 "the repo source now holds the live bytes" \
    grep -q 'alias ll' "$HOME/.config/niwa/files/zshrc"
niwa plan
check 5 "after the pull all three states agree (exit 0)" test "$STATUS" -eq 0

# --- a governed preference flip becomes an in-place edit -------------
/usr/bin/plutil -replace autohide -bool NO "$HOME/Library/Preferences/com.apple.dock.plist"

niwa pull --all
check 6 "pull accepts the flip (exit 0)" test "$STATUS" -eq 0
check 7 "the declaration was edited in place, still sugar" \
    grep -q "autohide = false" "$HOME/.config/niwa/modules/desktop.luau"
check 8 "no second opinion accumulated anywhere" \
    test "$(grep -rc autohide "$HOME/.config/niwa/modules" | grep -v ':0' | wc -l | tr -d ' ')" = "1"

# --- a hand-installed package becomes a placed proposal --------------
mkdir -p "$HOMEBREW_PREFIX/Cellar/htop/3.0.0"
echo '{"installed_on_request":true}' \
    >"$HOMEBREW_PREFIX/Cellar/htop/3.0.0/INSTALL_RECEIPT.json"
mkdir -p "$HOMEBREW_PREFIX/Cellar/libdep/1.0.0"
echo '{"installed_on_request":false}' \
    >"$HOMEBREW_PREFIX/Cellar/libdep/1.0.0/INSTALL_RECEIPT.json"

niwa pull --all
check 9 "pull stages the hand-installed formula (exit 0)" test "$STATUS" -eq 0
check 10 "the line landed in the one module that speaks brew" \
    grep -q '"htop"' "$HOME/.config/niwa/modules/cli.luau"
check 11 "a dependency never surfaces as a proposal" \
    sh -c "! grep -rq libdep '$HOME/.config/niwa'"

# --- an orphan is an offer, and accepting removes ---------------------
cat >"$HOME/.config/niwa/modules/cli.luau" <<'EOF'
local niwa = require("@niwa")
niwa.brew.formula { "htop" }
EOF

niwa pull --all
check 12 "pull --all stages the tree and stops there (exit 0)" \
    sh -c "test $STATUS -eq 0 && test -d '$HOMEBREW_PREFIX/Cellar/fd'"
check 12b "the removal is offered, not taken" \
    grep -q "interactive" "$SANDBOX/stdout"

# The explicit yes: the interactive walk, driven through a real tty.
{ sleep 1; printf 'a\n'; sleep 1; } | /usr/bin/script -q "$SANDBOX/walk.log" \
    "$NIWA_BIN" pull >/dev/null 2>&1 || true
check 13 "saying yes in the walk uninstalls the orphan" \
    test ! -d "$HOMEBREW_PREFIX/Cellar/fd"
check 14 "the declared formula stayed" test -d "$HOMEBREW_PREFIX/Cellar/htop"

# --- the question lands on stderr, the screen stays stdout ----------
mkdir -p "$HOMEBREW_PREFIX/Cellar/fd/9.0.0"
echo '{"installed_on_request":true}' \
    >"$HOMEBREW_PREFIX/Cellar/fd/9.0.0/INSTALL_RECEIPT.json"
{ sleep 1; printf 's\n'; sleep 1; } | /usr/bin/script -q "$SANDBOX/ask.log" \
    sh -c "'$NIWA_BIN' pull >'$SANDBOX/ask-stdout' 2>/dev/null" || true
check 14b "the answers are offered on stderr, not the screen" \
    sh -c "! grep -q 'a.pply' '$SANDBOX/ask-stdout'"

# --- skip returns; never is remembered ------------------------------
{ sleep 1; } | /usr/bin/script -q "$SANDBOX/skip-return.log" \
    "$NIWA_BIN" pull >/dev/null 2>&1 || true
check 14c "a skipped proposal returns on the next pull" \
    grep -q "fd" "$SANDBOX/skip-return.log"
{ sleep 1; printf 'n\n'; sleep 1; } | /usr/bin/script -q "$SANDBOX/never.log" \
    "$NIWA_BIN" pull >/dev/null 2>&1 || true
check 14d "the never landed in the journal, exact proposal and all" \
    grep -q "add:brew.formula:fd" "$HOME/.local/state/niwa/journal.json"
{ sleep 1; } | /usr/bin/script -q "$SANDBOX/after-never.log" \
    "$NIWA_BIN" pull >/dev/null 2>&1 || true
check 14e "a declined proposal is never made again" \
    sh -c "grep -q 'nothing to pull' '$SANDBOX/after-never.log' \
        && ! grep -q 'fd' '$SANDBOX/after-never.log'"
rm -rf "$HOMEBREW_PREFIX/Cellar/fd"

# --- a directory source pulls per file ------------------------------
mkdir -p "$HOME/.config/niwa/files/tools"
printf 'one\n' >"$HOME/.config/niwa/files/tools/alpha"
printf 'two\n' >"$HOME/.config/niwa/files/tools/beta"
cat >>"$HOME/.config/niwa/modules/cli.luau" <<'LUAU'
niwa.file("~/.tools/", { source = "@self/files/tools/" })
LUAU
niwa apply --yes
check 14f "the directory fanned out (exit 0)" \
    sh -c "test $STATUS -eq 0 && test -f '$HOME/.tools/alpha' && test -f '$HOME/.tools/beta'"
printf 'one edited\n' >"$HOME/.tools/alpha"
niwa pull --all
check 14g "only the edited file was pulled, the sibling stayed" \
    sh -c "grep -q 'one edited' '$HOME/.config/niwa/files/tools/alpha' \
        && grep -qx 'two' '$HOME/.config/niwa/files/tools/beta'"

# --- the gate holds a secret back -------------------------------------
printf 'export EDITOR=nvim\nexport GH=ghp_AbCdEfGhIjKlMnOpQrStUvWxYz012345\n' >"$HOME/.zshrc"

niwa pull --all
check 15 "the gated pull still exits 0" test "$STATUS" -eq 0
check 16 "the secret never reached the repo" \
    sh -c "! grep -q ghp_ '$HOME/.config/niwa/files/zshrc'"
grep -q "held back" "$SANDBOX/stdout" || { echo "gate said nothing" >&2; exit 1; }
printf 'export EDITOR=nvim\nalias ll="eza -l"\n' >"$HOME/.zshrc"

# --- add: install and write the line, one motion ----------------------
niwa add brew ripgrep
check 17 "add succeeds (exit 0)" test "$STATUS" -eq 0
check 18 "add installed the package" test -d "$HOMEBREW_PREFIX/Cellar/ripgrep"
check 19 "add wrote the line where brew lives" \
    grep -q '"ripgrep"' "$HOME/.config/niwa/modules/cli.luau"

# --- the watcher notifies and never applies ---------------------------
/usr/bin/plutil -replace tilesize -integer 64 "$HOME/Library/Preferences/com.apple.dock.plist"
: >"$CALLS"

niwa check --notify
check 20 "check --notify exits clean (exit 0)" test "$STATUS" -eq 0
check 21 "a notification was posted" grep -q "osascript" "$CALLS"
check 22 "the watcher changed nothing" \
    sh -c "/usr/bin/plutil -p '$HOME/Library/Preferences/com.apple.dock.plist' | grep -q '\"tilesize\" => 64'"
check 23 "the watcher edited no config" \
    grep -q "tilesize = 48" "$HOME/.config/niwa/modules/desktop.luau"

# --- fmt: one style for machine and human lines -----------------------
printf 'local niwa = require("@niwa")\nniwa.dock {\n        autohide = true,\n}\n' \
    >"$HOME/.config/niwa/modules/messy.luau"
niwa fmt
check 24 "fmt succeeds (exit 0)" test "$STATUS" -eq 0
check 25 "fmt normalized the indentation" \
    grep -q '^  autohide = true,$' "$HOME/.config/niwa/modules/messy.luau"

# --- one governed key is not a whole-domain subscription ------------
cat >>"$HOME/.config/niwa/modules/cli.luau" <<'LUAU'
niwa.defaults("com.example.churner", { theme = "dark" })
LUAU
niwa apply --yes
/usr/bin/plutil -replace cachetoken -string "a$(date +%s)"     "$HOME/Library/Preferences/com.example.churner.plist" 2>/dev/null || true
niwa pull --all
check 26 "an ungoverned key churning stays silence"     sh -c "! grep -q cachetoken '$SANDBOX/stdout'"
/usr/bin/plutil -replace theme -string "light"     "$HOME/Library/Preferences/com.example.churner.plist"
niwa pull --all
check 27 "the governed key moving still proposes"     grep -q "theme" "$SANDBOX/stdout"

# --- the watchlist is settings domains, not every plist --------------
/usr/bin/plutil -replace ShowPathbar -bool NO \
    "$HOME/Library/Preferences/com.apple.finder.plist" 2>/dev/null ||
    /usr/bin/plutil -create xml1 "$HOME/Library/Preferences/com.apple.finder.plist" &&
    /usr/bin/plutil -replace ShowPathbar -bool NO \
        "$HOME/Library/Preferences/com.apple.finder.plist"
/usr/bin/plutil -create xml1 "$HOME/Library/Preferences/com.example.private.plist"
/usr/bin/plutil -replace mood -string calm \
    "$HOME/Library/Preferences/com.example.private.plist"
niwa pull --all
/usr/bin/plutil -replace ShowPathbar -bool YES \
    "$HOME/Library/Preferences/com.apple.finder.plist"
/usr/bin/plutil -replace mood -string wild \
    "$HOME/Library/Preferences/com.example.private.plist"
niwa pull --all
check 28 "a flip in an untouched settings domain proposes" \
    grep -q "ShowPathbar" "$SANDBOX/stdout"
check 29 "a foreign domain's churn is silence" \
    sh -c "! grep -q mood '$SANDBOX/stdout'"

echo "drill: drift and pull · all checks passed"

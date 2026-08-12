#!/bin/sh
# Drill: config rot, asked and cached.
#
# `check --upstream` asks brew, npm, and the repository host whether
# the declared things still exist; a ghost fails the check by name.
# The watcher refreshes the digest weekly — outdated counts wait in
# the dashboard's warm line, and only actual breakage notifies.

. "$(dirname "$0")/lib.sh"

echo "drill: upstream rot"

BIN="$SANDBOX/bin"
mkdir -p "$BIN"
export HOMEBREW_PREFIX="$SANDBOX/brew"
mkdir -p "$HOMEBREW_PREFIX/Cellar/jq/1.7.1"
echo '{"installed_on_request":true}' \
    >"$HOMEBREW_PREFIX/Cellar/jq/1.7.1/INSTALL_RECEIPT.json"

CALLS="$SANDBOX/calls.log"
cat >"$BIN/brew" <<EOF
#!/bin/sh
echo "brew \$*" >>"$CALLS"
case "\$1 \$2" in
"outdated --quiet")
    printf 'neovim\nripgrep\n'
    ;;
"info --formula")
    case "\$*" in
    *ghost-formula*)
        echo "Error: No available formula with the name \"ghost-formula\"." >&2
        exit 1
        ;;
    esac
    ;;
esac
exit 0
EOF
chmod 755 "$BIN/brew"
cat >"$BIN/curl" <<EOF
#!/bin/sh
echo "curl \$*" >>"$CALLS"
for arg in "\$@"; do url="\$arg"; done
case "\$url" in
*repos/dead/repo) exit 22 ;;
*releases/latest) echo '{"tag_name":"v9.9.9"}' ;;
esac
exit 0
EOF
chmod 755 "$BIN/curl"
cat >"$BIN/scutil" <<'EOF'
#!/bin/sh
echo "drillbox"
EOF
chmod 755 "$BIN/scutil"
export PATH="$BIN:$STUBS:/usr/bin:/bin"

config
cat >"$HOME/.config/niwa/init.luau" <<'EOF'
local niwa = require("@niwa")
niwa.brew.formula { "jq", "ghost-formula" }
EOF
cat >"$HOME/.config/niwa/niwa.lock" <<'EOF'
[github_release."live/repo"]
version = "1.0.0"
sha256 = "0000000000000000000000000000000000000000000000000000000000000000"

[github_release."dead/repo"]
version = "2.0.0"
sha256 = "0000000000000000000000000000000000000000000000000000000000000000"
EOF

# --- the rot survey, spoken -----------------------------------------
niwa check --upstream
check 1 "a ghost fails the check (exit 1)" test "$STATUS" -eq 1
check 2 "the ghost formula is named" \
    grep -q "brew.formula:ghost-formula" "$SANDBOX/stdout"
check 3 "the dead repository is named" \
    grep -q "github_release:dead/repo.*gone" "$SANDBOX/stdout"

cat >"$HOME/.config/niwa/init.luau" <<'EOF'
local niwa = require("@niwa")
niwa.brew.formula { "jq" }
EOF
cat >"$HOME/.config/niwa/niwa.lock" <<'EOF'
[github_release."live/repo"]
version = "1.0.0"
sha256 = "0000000000000000000000000000000000000000000000000000000000000000"
EOF
niwa check --upstream
check 4 "a clean upstream passes (exit 0)" \
    sh -c "test $STATUS -eq 0 && grep -q 'still exists upstream' '$SANDBOX/stdout'"

# --- the weekly digest and the warm dashboard line ------------------
niwa check --notify
check 5 "the watcher writes the digest" \
    test -f "$HOME/.local/state/niwa/digest.json"
check 6 "the digest counts brew and lock outdated" sh -c "
    grep -q '\"brew_outdated\": 2' '$HOME/.local/state/niwa/digest.json' &&
    grep -q '\"lock_outdated\": 1' '$HOME/.local/state/niwa/digest.json'"
check 7 "nothing broken means no rot notification" \
    sh -c "! grep -q 'gone upstream' '$SANDBOX/system.log' 2>/dev/null"

niwa
check 8 "the dashboard renders the warm outdated line" \
    grep -q "3 outdated · brew 2 · lock 1" "$SANDBOX/stdout"

REFRESHES=$(grep -c "outdated --quiet" "$CALLS")
niwa check --notify
check 9 "a fresh digest is not refreshed again" \
    test "$(grep -c 'outdated --quiet' "$CALLS")" -eq "$REFRESHES"

# --- breakage is the one rot ping -----------------------------------
cat >"$HOME/.config/niwa/init.luau" <<'EOF'
local niwa = require("@niwa")
niwa.brew.formula { "jq", "ghost-formula" }
EOF
rm "$HOME/.local/state/niwa/digest.json"
niwa check --notify
check 10 "actual breakage notifies, naming the count" \
    grep -q "gone upstream: 1 declared thing" "$SANDBOX/system.log"

echo "drill: upstream rot · all checks passed"

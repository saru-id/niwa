#!/bin/sh
# Drill: packages via receipts, batching, the barrier, and failure.
#
# A stub brew stands in for the real one: it logs every invocation and
# lays down receipts, so the drill can prove there was ONE invocation
# for a whole list, that reading a result flushes the batch early,
# that a file effect between packages splits the batch to keep program
# order, and that a failing package halts the run with honest counts.

. "$(dirname "$0")/lib.sh"

echo "drill: brew batching"

# --- the fake brew prefix and the stub executable ------------------
export HOMEBREW_PREFIX="$SANDBOX/brew"
mkdir -p "$HOMEBREW_PREFIX/Cellar" "$HOMEBREW_PREFIX/Caskroom"
BREWLOG="$SANDBOX/brew.log"
BIN="$SANDBOX/bin"
mkdir -p "$BIN"
cat >"$BIN/brew" <<EOF
#!/bin/sh
# Stub brew: log the invocation, lay receipts for every name except
# the one called "broken", which fails the way brew fails.
echo "\$*" >>"$BREWLOG"
shift # drop "install"
status=0
for name in "\$@"; do
    case "\$name" in
    --cask) continue ;;
    broken)
        echo "Error: broken: no bottles available" >&2
        status=1
        ;;
    *)
        mkdir -p "$HOMEBREW_PREFIX/Cellar/\$name/1.0.0"
        echo '{"installed_on_request":true}' \
            >"$HOMEBREW_PREFIX/Cellar/\$name/1.0.0/INSTALL_RECEIPT.json"
        ;;
    esac
done
exit \$status
EOF
chmod 755 "$BIN/brew"
export PATH="$BIN:$STUBS:/usr/bin:/bin"

config

# --- 1: a list is one invocation ------------------------------------
cat >"$HOME/.config/niwa/init.luau" <<'EOF'
local niwa = require("@niwa")
niwa.brew.formula { "fd", "ripgrep", "jq" }
EOF

niwa apply --yes
check 1 "apply with a three-name list succeeds" test "$STATUS" -eq 0
check 2 "the list was one brew invocation" \
    test "$(wc -l <"$BREWLOG" | tr -d ' ')" = "1"
check 3 "all three receipts landed" \
    test -d "$HOMEBREW_PREFIX/Cellar/fd" -a -d "$HOMEBREW_PREFIX/Cellar/ripgrep" -a -d "$HOMEBREW_PREFIX/Cellar/jq"

niwa plan
check 4 "the machine is converged after the install (exit 0)" test "$STATUS" -eq 0

# --- 2: reading a result is a barrier --------------------------------
rm -rf "$HOMEBREW_PREFIX/Cellar" && mkdir -p "$HOMEBREW_PREFIX/Cellar"
: >"$BREWLOG"
cat >"$HOME/.config/niwa/init.luau" <<'EOF'
local niwa = require("@niwa")
local first = niwa.brew.formula "neovim"
assert(first.changed == true)  -- the read flushes the batch
niwa.brew.formula { "fd", "jq" }
EOF

niwa apply --yes
check 5 "apply with a barrier read succeeds" test "$STATUS" -eq 0
check 6 "the barrier split the work into two invocations" \
    test "$(wc -l <"$BREWLOG" | tr -d ' ')" = "2"
check 7 "the first invocation carried only the read package" \
    grep -q "^install neovim$" "$BREWLOG"

# --- 3: a file effect keeps program order -----------------------------
rm -rf "$HOMEBREW_PREFIX/Cellar" && mkdir -p "$HOMEBREW_PREFIX/Cellar"
: >"$BREWLOG"
mkdir -p "$HOME/.config/niwa/files"
printf 'hello\n' >"$HOME/.config/niwa/files/marker"
cat >"$HOME/.config/niwa/init.luau" <<'EOF'
local niwa = require("@niwa")
niwa.brew.formula "fd"
niwa.file("~/.marker", { source = "@self/files/marker" })
niwa.brew.formula "jq"
EOF

niwa apply --yes
check 8 "apply with an interleaved file succeeds" test "$STATUS" -eq 0
check 9 "program order split the batch around the file" \
    test "$(wc -l <"$BREWLOG" | tr -d ' ')" = "2"

# --- 4: failure halts with honest counts ------------------------------
rm -rf "$HOMEBREW_PREFIX/Cellar" && mkdir -p "$HOMEBREW_PREFIX/Cellar"
: >"$BREWLOG"
rm -f "$HOME/.marker"
cat >"$HOME/.config/niwa/init.luau" <<'EOF'
local niwa = require("@niwa")
niwa.brew.formula { "broken" }
niwa.file("~/.marker", { source = "@self/files/marker" })
EOF

niwa apply --yes
check 10 "a failing package fails the apply (exit 1)" test "$STATUS" -eq 1
check 11 "the resource after the failure was not reached" \
    test ! -e "$HOME/.marker"
check 12 "the failure names the command" \
    grep -q "brew install broken" "$SANDBOX/stderr"

# --- 4b: a re-run repeats nothing already done ----------------------
cat >"$HOME/.config/niwa/init.luau" <<'LUAU'
local niwa = require("@niwa")
niwa.brew.formula { "jq", "broken" }
niwa.file("~/.marker", { source = "@self/files/marker" })
LUAU
rm -rf "$HOMEBREW_PREFIX/Cellar" && mkdir -p "$HOMEBREW_PREFIX/Cellar"
rm -f "$HOME/.marker"
: >"$BREWLOG"
niwa apply --yes
check 12b "the failure line carries the honest counts" \
    grep -q "not reached · re-run to continue" "$SANDBOX/stdout"
niwa apply --yes
check 12c "the re-run skips the package that already landed" \
    sh -c "! sed -n '2p' '$BREWLOG' | grep -q jq"
mkdir -p "$HOMEBREW_PREFIX/Cellar/broken/1.0.0"
echo '{"installed_on_request":true}' \
    >"$HOMEBREW_PREFIX/Cellar/broken/1.0.0/INSTALL_RECEIPT.json"
niwa apply --yes
check 12d "once the cause is fixed the run continues to the end" \
    sh -c "test $STATUS -eq 0 && test -e '$HOME/.marker'"
rm -rf "$HOMEBREW_PREFIX/Cellar/broken" "$HOME/.marker"

# --- 5: optional failure is a result, not a halt ----------------------
cat >"$HOME/.config/niwa/init.luau" <<'EOF'
local niwa = require("@niwa")
local nice = niwa.brew.formula { name = "broken", optional = true }
if not nice.failed then
  -- Only configure the nice-to-have when it actually made it.
  niwa.file("~/.nice-configured", { source = "@self/files/marker" })
end
niwa.file("~/.marker", { source = "@self/files/marker" })
EOF

niwa apply --yes
check 13 "an optional failure does not halt the run" test "$STATUS" -eq 0
check 14 "the resource after the optional failure was reached" \
    test -e "$HOME/.marker"
check 15 "the branch on .failed skipped the dependent config" \
    test ! -e "$HOME/.nice-configured"

# --- 6: undo uninstalls what the run installed -------------------------
rm -rf "$HOMEBREW_PREFIX/Cellar" && mkdir -p "$HOMEBREW_PREFIX/Cellar"
cat >"$BIN/brew" <<EOF
#!/bin/sh
echo "\$*" >>"$BREWLOG"
case "\$1" in
install)
    shift
    for name in "\$@"; do
        [ "\$name" = "--cask" ] && continue
        mkdir -p "$HOMEBREW_PREFIX/Cellar/\$name/1.0.0"
        echo '{"installed_on_request":true}' \
            >"$HOMEBREW_PREFIX/Cellar/\$name/1.0.0/INSTALL_RECEIPT.json"
    done
    ;;
uninstall)
    shift
    for name in "\$@"; do
        [ "\$name" = "--cask" ] && continue
        rm -rf "$HOMEBREW_PREFIX/Cellar/\$name"
    done
    ;;
esac
exit 0
EOF
chmod 755 "$BIN/brew"
cat >"$HOME/.config/niwa/init.luau" <<'EOF'
local niwa = require("@niwa")
niwa.brew.formula "hyperfine"
EOF

niwa apply --yes
check 16 "the package installed" test -d "$HOMEBREW_PREFIX/Cellar/hyperfine"
niwa undo --yes
check 17 "undo succeeds (exit 0)" test "$STATUS" -eq 0
check 18 "undo uninstalled the package this run installed" \
    test ! -d "$HOMEBREW_PREFIX/Cellar/hyperfine"

# --- consecutive singles coalesce into one invocation ---------------
: >"$BREWLOG"
cat >"$HOME/.config/niwa/init.luau" <<'LUAU'
local niwa = require("@niwa")
niwa.brew.formula "fzf"
niwa.brew.formula "zoxide"
LUAU
niwa apply --yes
check 19 "two consecutive singles land as one invocation" \
    sh -c "test $STATUS -eq 0 && test \"\$(wc -l <'$BREWLOG' | tr -d ' ')\" = '1'"

# --- 7: batched and split runs land the same machine ----------------
rm -rf "$HOMEBREW_PREFIX/Cellar" && mkdir -p "$HOMEBREW_PREFIX/Cellar"
cat >"$HOME/.config/niwa/init.luau" <<'LUAU'
local niwa = require("@niwa")
niwa.brew.formula { "fd", "ripgrep", "jq" }
LUAU
niwa apply --yes
BATCHED="$(ls "$HOMEBREW_PREFIX/Cellar" | sort | tr '\n' ' ')"
rm -rf "$HOMEBREW_PREFIX/Cellar" && mkdir -p "$HOMEBREW_PREFIX/Cellar"
rm -rf "$HOME/.local/state/niwa"
cat >"$HOME/.config/niwa/init.luau" <<'LUAU'
local niwa = require("@niwa")
niwa.brew.formula "fd"
niwa.file("~/.cut", { content = "the batch barrier\n" })
niwa.brew.formula "ripgrep"
niwa.file("~/.cut2", { content = "another barrier\n" })
niwa.brew.formula "jq"
LUAU
niwa apply --yes
check 20 "batched and split runs land the same packages" \
    sh -c "test $STATUS -eq 0 \
        && test \"\$(ls '$HOMEBREW_PREFIX/Cellar' | sort | tr '\n' ' ')\" = \"$BATCHED\""

echo "drill: brew batching · all checks passed"

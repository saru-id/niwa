#!/bin/sh
# Drill: apply, idempotence, the overwrite rule, and undo.
#
# One file and one preference key go from pending to applied. A second
# apply changes nothing. A hand edit is protected until --force, the
# displaced bytes are archived, and undo brings the hand edit back.

. "$(dirname "$0")/lib.sh"

echo "drill: apply and undo"

config
cat >"$HOME/.config/niwa/init.luau" <<'EOF'
local niwa = require("@niwa")
niwa.file("~/.zshrc", { source = "@self/files/zshrc" })
niwa.dock { autohide = true }
EOF
mkdir -p "$HOME/.config/niwa/files"
printf 'export EDITOR=nvim\n' >"$HOME/.config/niwa/files/zshrc"

niwa apply --yes
check 1 "apply succeeds (exit 0)" test "$STATUS" -eq 0
check 2 "the file was written with the source bytes" \
    cmp -s "$HOME/.zshrc" "$HOME/.config/niwa/files/zshrc"
check 3 "the preference key was written" \
    grep -qc autohide "$HOME/Library/Preferences/com.apple.dock.plist"
check 4 "the journal exists and is not committed state" \
    test -f "$HOME/.local/state/niwa/journal.json"

niwa plan
check 5 "the machine is converged after apply (exit 0)" test "$STATUS" -eq 0

niwa apply --yes --verify
check 6 "a second apply verifies clean (exit 0)" test "$STATUS" -eq 0

# A hand edit is a person's work: apply must not replace it.
printf 'export EDITOR=vim # mine\n' >"$HOME/.zshrc"
niwa apply --yes
check 7 "apply leaves the hand edit in place" \
    grep -q "mine" "$HOME/.zshrc"

niwa apply --yes --force
check 8 "apply --force replaces the hand edit" \
    cmp -s "$HOME/.zshrc" "$HOME/.config/niwa/files/zshrc"
check 9 "the displaced hand edit was archived first" \
    sh -c 'grep -rq "mine" "$HOME/.local/state/niwa/archive"'

niwa undo --yes
check 10 "undo succeeds (exit 0)" test "$STATUS" -eq 0
check 11 "undo restored the hand edit" grep -q "mine" "$HOME/.zshrc"

niwa undo --yes
niwa undo --yes
check 12 "undo bottoms out quietly (exit 0)" test "$STATUS" -eq 0

# One apply at a time: a held lock refuses the second.
mkdir -p "$HOME/.local/state/niwa"
touch "$HOME/.local/state/niwa/apply.lock"
niwa apply --yes
check 13 "a held lock refuses a second apply (exit 1)" test "$STATUS" -eq 1
rm "$HOME/.local/state/niwa/apply.lock"

# --- the stale-lock story -------------------------------------------
# A lock stamped by a live process refuses; one stamped by a dead
# process is reclaimed, because a crash must never need a human with
# an rm.
echo "$$" >"$HOME/.local/state/niwa/apply.lock"
niwa apply --yes
check 13b "a live holder's lock refuses (exit 1)" test "$STATUS" -eq 1
echo "4194000" >"$HOME/.local/state/niwa/apply.lock"
niwa apply --yes
check 13c "a dead holder's lock is reclaimed (exit 0)" test "$STATUS" -eq 0
check 13d "the reclaim is said out loud"     grep -q "reclaimed" "$SANDBOX/stdout"

# --- the archive horizon --------------------------------------------
# An archive past ninety days that the newest apply does not
# reference goes quietly on the next apply.
STALE="$HOME/.local/state/niwa/archive/drill-stale"
mkdir -p "$STALE"
echo "old bytes" >"$STALE/0000000000000000000000000000000000000000000000000000000000000000"
/usr/bin/touch -t 202001010000 \
    "$STALE/0000000000000000000000000000000000000000000000000000000000000000"
niwa apply --yes
check 14 "the apply still succeeds (exit 0)" test "$STATUS" -eq 0
check 15 "the stale archive was pruned, directory and all" \
    sh -c "! test -e '$STALE'"

# --- a failed reverse keeps the remainder undoable ------------------
# Two steps land; the older one's archive is destroyed. Undo reverses
# the newer step, fails on the older, and the journal must still hold
# the un-reversed step — never forget work it has not taken back.
echo "hand-made" >"$HOME/.undo-keeper"
cat >"$HOME/.config/niwa/init.luau" <<'LUAU'
local niwa = require("@niwa")
niwa.file("~/.undo-keeper", { content = "niwa's version" })
niwa.file("~/.undo-newer", { content = "second step" })
LUAU
niwa apply --yes --force
check 16 "the two-step apply lands (exit 0)" test "$STATUS" -eq 0
rm -rf "$HOME/.local/state/niwa/archive/file:~_.undo-keeper"
niwa undo --yes
check 17 "undo fails on the destroyed archive (exit 1)" test "$STATUS" -eq 1
check 18 "the newer step was reversed before the failure" \
    sh -c "! test -e '$HOME/.undo-newer'"
niwa undo --yes
check 19 "the un-reversed step is still known" \
    grep -q "undo would reverse 1 change" "$SANDBOX/stdout"

echo "drill: apply and undo · all checks passed"

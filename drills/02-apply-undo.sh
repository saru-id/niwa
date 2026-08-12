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

echo "drill: apply and undo · all checks passed"

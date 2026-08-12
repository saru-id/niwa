#!/bin/sh
# Drill: stamps, machines, explain, doctor, and the rename warning.
#
# After an apply the machine leaves one committed stamp; machines
# reads the fleet from stamps alone; explain prints the model for one
# identity; doctor answers for the safety net and fails honestly when
# a secret is missing; and a machine wearing a new name is told about
# its old files instead of silently orphaning them.

. "$(dirname "$0")/lib.sh"

echo "drill: stamps, explain, doctor"

BIN="$SANDBOX/bin"
mkdir -p "$BIN"
cat >"$BIN/scutil" <<'EOF'
#!/bin/sh
echo "drillbox"
EOF
chmod 755 "$BIN/scutil"
export PATH="$BIN:$STUBS:/usr/bin:/bin"

config
cat >"$HOME/.config/niwa/init.luau" <<'EOF'
local niwa = require("@niwa")
niwa.dock { autohide = true, tilesize = 48 }
EOF

# A config repo with history, so stamps carry commits.
git -C "$HOME/.config/niwa" init -q -b main
git -C "$HOME/.config/niwa" -c user.name=drill -c user.email=drill@test \
    -c commit.gpgsign=false add -A
git -C "$HOME/.config/niwa" -c user.name=drill -c user.email=drill@test \
    -c commit.gpgsign=false commit -qm "config"

niwa apply --yes
check 1 "apply succeeds (exit 0)" test "$STATUS" -eq 0
STAMP="$HOME/.config/niwa/state/drillbox.toml"
check 2 "the stamp landed under the machine's name" test -f "$STAMP"
check 3 "the stamp records the applied time and count" \
    sh -c "grep -q applied '$STAMP' && grep -q resources '$STAMP'"
check 4 "the stamp records the config commit" grep -q config "$STAMP"

niwa apply --yes
check 5 "the stamp does not block an unattended re-apply" test "$STATUS" -eq 0

# A second machine's stamp, by hand, three weeks stale.
cat >"$HOME/.config/niwa/state/workbox.toml" <<'EOF'
machine_id = "0000-ANOTHER-MACHINE-0000"
name = "workbox"
applied = "2026-07-20T09:00:00Z"
niwa = "0.1.0"
resources = 5
EOF

niwa machines
check 6 "machines lists both stamps (exit 0)" test "$STATUS" -eq 0
check 7 "this machine wears the cursor" grep -q "^ *\* drillbox" "$SANDBOX/stdout"
check 8 "the stale machine reads in weeks" grep -q "workbox.*w ago" "$SANDBOX/stdout"

# --- explain: the model for one identity ------------------------------
niwa explain dock.autohide
check 9 "explain answers (exit 0)" test "$STATUS" -eq 0
check 10 "explain shows the declaration and its source" \
    sh -c "grep -q 'declared' '$SANDBOX/stdout' && grep -q 'init.luau:2' '$SANDBOX/stdout'"
check 11 "explain shows the actual value" grep -q "actual" "$SANDBOX/stdout"
check 12 "explain shows the acknowledgement" grep -q "acknowledged" "$SANDBOX/stdout"

niwa explain nothing-like-this
check 13 "an unknown target fails with candidates (exit 1)" test "$STATUS" -eq 1

# --- doctor: the net answers for itself -------------------------------
niwa doctor --deep
check 14 "a healthy machine passes doctor (exit 0)" test "$STATUS" -eq 0

cat >"$HOME/.config/niwa/init.luau" <<'EOF'
local niwa = require("@niwa")
niwa.dock { autohide = true }
local gone = niwa.secret("never-stored")
niwa.file("~/.x", { content = niwa.render("{gone}", { gone = gone }) })
EOF
niwa doctor
check 15 "a missing secret fails doctor (exit 1)" test "$STATUS" -eq 1
check 16 "doctor names the secret" grep -q "never-stored" "$SANDBOX/stdout"

# --- the rename warning ----------------------------------------------
cat >"$HOME/.config/niwa/init.luau" <<'EOF'
local niwa = require("@niwa")
niwa.dock { autohide = true }
EOF
OWN_ID=$(grep machine_id "$STAMP" | cut -d'"' -f2)
rm "$STAMP"
cat >"$HOME/.config/niwa/state/oldbox.toml" <<EOF
machine_id = "$OWN_ID"
name = "oldbox"
applied = "2026-08-01T09:00:00Z"
niwa = "0.1.0"
resources = 2
EOF

# The edits above are a person's config changes; commit them the way
# a person would before an unattended apply.
git -C "$HOME/.config/niwa" -c user.name=drill -c user.email=drill@test \
    -c commit.gpgsign=false add -A
git -C "$HOME/.config/niwa" -c user.name=drill -c user.email=drill@test \
    -c commit.gpgsign=false commit -qm "rename setup"

niwa apply --yes
check 17 "apply still succeeds under the new name (exit 0)" test "$STATUS" -eq 0
check 18 "the rename is named, not guessed at" \
    sh -c "grep -q 'oldbox' '$SANDBOX/stdout' && grep -q 'drillbox' '$SANDBOX/stdout'"

# --- unattended refuses what nobody committed -----------------------
echo "-- an uncommitted edit" >>"$HOME/.config/niwa/init.luau"
niwa apply --yes
check 19 "apply --yes refuses a dirty tree (exit 1)" test "$STATUS" -eq 1
niwa apply --yes --dirty
check 20 "--dirty says you truly mean it (exit 0)" test "$STATUS" -eq 0

echo "drill: stamps, explain, doctor · all checks passed"

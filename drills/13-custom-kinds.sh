#!/bin/sh
# Drill: custom kinds, driven end to end.
#
# A kind the config defines itself runs its own check on the plan
# pass, its own apply on the execute pass, and lands in the journal
# irreversible by name. The plan line speaks the kind's `describe`
# words. A privileged kind folds into --no-privileged. Undo names
# what it cannot take back and touches nothing.

. "$(dirname "$0")/lib.sh"

echo "drill: custom kinds"

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

-- A marker kind: presence of a file, checked by exit code.
local marker = niwa.resource("drill.marker", {
    check = function(read, spec)
        return read.exec(`test -f $HOME/markers/{spec.name}`).code == 0
    end,
    apply = function(act, spec)
        act.exec(`mkdir -p $HOME/markers && touch $HOME/markers/{spec.name}`)
    end,
    reverse = function(act, spec)
        act.exec(`rm -f $HOME/markers/{spec.name}`)
    end,
    describe = function(spec)
        return `marker {spec.name}`
    end,
})
marker { name = "alpha" }

-- A content kind: the declared word must appear in a register file,
-- checked through stdout the way the design's example reads it.
local entry = niwa.resource("drill.entry", {
    check = function(read, spec)
        return read.exec("cat $HOME/register 2>/dev/null").stdout
            :find(spec.name, 1, true) ~= nil
    end,
    apply = function(act, spec)
        act.exec(`echo {spec.name} >>$HOME/register`)
    end,
    reverse = false,
    describe = function(spec)
        return `register entry {spec.name}`
    end,
})
entry { name = "omega" }

-- A privileged kind: skipped whole under --no-privileged.
local rooted = niwa.resource("drill.rooted", {
    check = function(read, spec)
        return read.exec(`test -f $HOME/rooted-{spec.name}`).code == 0
    end,
    apply = function(act, spec)
        act.exec(`touch $HOME/rooted-{spec.name}`)
    end,
    reverse = false,
    describe = function(spec)
        return `rooted {spec.name}`
    end,
    privileged = true,
})
rooted { name = "deep" }
EOF
git -C "$HOME/.config/niwa" init -q -b main
git -C "$HOME/.config/niwa" -c user.name=d -c user.email=d@t \
    -c commit.gpgsign=false add -A
git -C "$HOME/.config/niwa" -c user.name=d -c user.email=d@t \
    -c commit.gpgsign=false commit -qm custom

# --- plan: the kind's own check, the kind's own words ---------------
niwa plan
check 1 "a fresh machine is pending (exit 2)" test "$STATUS" -eq 2
check 2 "the plan line speaks the describe text" \
    sh -c "grep -q 'marker alpha' '$SANDBOX/stdout' &&
        grep -q 'register entry omega' '$SANDBOX/stdout'"
check 3 "the plan pass changed nothing" \
    sh -c "! test -e '$HOME/markers' && ! test -e '$HOME/register'"

# --- apply without privileges: two land, one is skipped -------------
niwa apply --yes --no-privileged
check 4 "apply succeeds (exit 0)" test "$STATUS" -eq 0
check 5 "the marker kind applied through its handler" \
    test -f "$HOME/markers/alpha"
check 6 "the content kind applied through its handler" \
    grep -q "omega" "$HOME/register"
check 7 "the privileged kind was left untouched" \
    sh -c "! test -e '$HOME/rooted-deep'"
check 8 "the journal marks the changes irreversible by name" \
    sh -c "grep -q 'marker alpha' '$HOME/.local/state/niwa/journal.json' &&
        grep -q 'register entry omega' '$HOME/.local/state/niwa/journal.json'"

niwa apply --yes --no-privileged
check 9 "a second apply reruns nothing (exit 0)" test "$STATUS" -eq 0
check 10 "the register was not appended twice" \
    test "$(grep -c omega "$HOME/register")" -eq 1

# --- undo: named honestly, nothing touched --------------------------
niwa undo --yes
check 11 "undo answers (exit 0)" test "$STATUS" -eq 0
check 12 "undo names what it cannot take back" \
    sh -c "grep -Eq 'marker alpha|register entry omega' '$SANDBOX/stdout'"
check 13 "undo touched neither resource" \
    sh -c "test -f '$HOME/markers/alpha' && grep -q omega '$HOME/register'"

# --- the full apply reaches the privileged kind ---------------------
niwa apply --yes
check 14 "a full apply lands the privileged kind (exit 0)" \
    sh -c "test $STATUS -eq 0 && test -f '$HOME/rooted-deep'"

# --- queries are memoised: the run sees one consistent world --------
cat >"$HOME/.config/niwa/init.luau" <<'LUAU'
local niwa = require("@niwa")
local before = niwa.exists("~/.memo-probe")
local probe = niwa.resource("drill.probe", {
    check = function(read, spec)
        return read.exec("test -f $HOME/.memo-probe").code == 0
    end,
    apply = function(act, spec)
        act.exec("touch $HOME/.memo-probe")
    end,
    reverse = false,
    describe = function(spec)
        return `probe {spec.name}`
    end,
})
probe { name = "one" }
assert(niwa.exists("~/.memo-probe") == before,
    "the run must see one consistent world")
LUAU
git -C "$HOME/.config/niwa" -c user.name=d -c user.email=d@t \
    -c commit.gpgsign=false add -A
git -C "$HOME/.config/niwa" -c user.name=d -c user.email=d@t \
    -c commit.gpgsign=false commit -qm probe
niwa apply --yes
check 15 "an apply's own effect stays invisible to this run's queries" \
    sh -c "test $STATUS -eq 0 && test -f '$HOME/.memo-probe'"

echo "drill: custom kinds · all checks passed"

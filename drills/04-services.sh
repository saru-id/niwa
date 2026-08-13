#!/bin/sh
# Drill: launchd services, brew services, and restart coalescing.
#
# Stub launchctl, brew, and killall executables record every call, so
# the drill can prove the plist lands where launchd looks, a changed
# definition reloads and kickstarts, five preference writes bounce one
# process once, and undo boots the agent out again.

. "$(dirname "$0")/lib.sh"

echo "drill: services"

export HOMEBREW_PREFIX="$SANDBOX/brew"
mkdir -p "$HOMEBREW_PREFIX/Cellar"
CALLS="$SANDBOX/calls.log"
BIN="$SANDBOX/bin"
mkdir -p "$BIN"

cat >"$BIN/launchctl" <<EOF
#!/bin/sh
echo "launchctl \$*" >>"$CALLS"
exit 0
EOF
cat >"$BIN/killall" <<EOF
#!/bin/sh
echo "killall \$*" >>"$CALLS"
exit 0
EOF
stub_brew "$CALLS"
chmod 755 "$BIN/launchctl" "$BIN/killall" "$BIN/brew"
export PATH="$BIN:$STUBS:/usr/bin:/bin"

config
cat >"$HOME/.config/niwa/init.luau" <<'EOF'
local niwa = require("@niwa")
niwa.service {
  label    = "dev.drill.sync",
  program  = { "~/.local/bin/sync-notes", "--quiet" },
  interval = "15m",
  logs     = "~/.local/state/sync-notes/",
}
EOF

niwa apply --yes
check 1 "apply succeeds (exit 0)" test "$STATUS" -eq 0
PLIST="$HOME/Library/LaunchAgents/dev.drill.sync.plist"
check 2 "the agent's plist landed where launchd looks" test -f "$PLIST"
check 3 "the agent was bootstrapped" grep -q "launchctl bootstrap" "$CALLS"
check 4 "the log directory exists before launchd needs it" \
    test -d "$HOME/.local/state/sync-notes"
check 5 "the program path expanded past the tilde" \
    sh -c "/usr/bin/plutil -p '$PLIST' | grep -q '$HOME/.local/bin/sync-notes'"

niwa plan
check 6 "the service is converged (exit 0)" test "$STATUS" -eq 0

# A changed definition reloads: bootout, bootstrap, kickstart.
: >"$CALLS"
cat >"$HOME/.config/niwa/init.luau" <<'EOF'
local niwa = require("@niwa")
niwa.service {
  label    = "dev.drill.sync",
  program  = { "~/.local/bin/sync-notes", "--quiet" },
  interval = "30m",
  logs     = "~/.local/state/sync-notes/",
}
EOF

niwa plan
check 7 "a changed definition is pending (exit 2)" test "$STATUS" -eq 2

niwa apply --yes
check 8 "the reload boots out, bootstraps, and kickstarts" \
    sh -c "grep -q 'launchctl bootout' '$CALLS' && grep -q 'launchctl bootstrap' '$CALLS' && grep -q 'launchctl kickstart' '$CALLS'"

niwa undo --yes
check 9 "undo restores the previous definition" \
    sh -c "/usr/bin/plutil -p '$PLIST' | grep -q '\"StartInterval\" => 900'"

# Brew services: declaring implies the formula, the plist is the receipt.
: >"$CALLS"
cat >"$HOME/.config/niwa/init.luau" <<'EOF'
local niwa = require("@niwa")
niwa.brew.service "redis"
EOF

niwa apply --yes
check 10 "brew service apply succeeds (exit 0)" test "$STATUS" -eq 0
check 11 "the implied formula was installed first" \
    grep -q "brew install redis" "$CALLS"
check 12 "the service was started" grep -q "brew services start redis" "$CALLS"
check 13 "homebrew's plist is the receipt" \
    test -f "$HOME/Library/LaunchAgents/homebrew.mxcl.redis.plist"

niwa plan
check 14 "the brew service is converged (exit 0)" test "$STATUS" -eq 0

niwa undo --yes
check 15 "undo stopped the service" grep -q "brew services stop redis" "$CALLS"

# Restart coalescing: five dock writes, one bounce, at the end.
: >"$CALLS"
cat >"$HOME/.config/niwa/init.luau" <<'EOF'
local niwa = require("@niwa")
niwa.dock {
  autohide = true,
  tilesize = 48,
  apps = {},
  minimize_effect = "scale",
}
niwa.defaults("com.apple.dock", { orientation = "left" }, { restart = "Dock" })
EOF

niwa apply --yes
check 16 "the defaults apply succeeds (exit 0)" test "$STATUS" -eq 0
check 17 "five dock writes bounced the Dock exactly once" \
    test "$(grep -c "killall Dock" "$CALLS")" = "1"

# --- unattended converge is dogfood ---------------------------------
# The design's own pattern: a declared service running niwa itself.
# The watcher never applies; only this, a service the person wrote,
# converges unattended.
cat >"$HOME/.config/niwa/init.luau" <<'EOF'
local niwa = require("@niwa")
niwa.service {
  label    = "dev.drill.converge",
  program  = { "~/.local/bin/niwa", "apply", "--yes", "--no-privileged" },
  calendar = { hour = 3 },
  logs     = "~/.local/state/converge/",
}
EOF
niwa apply --yes
check 18 "the dogfood service applies (exit 0)" test "$STATUS" -eq 0
check 19 "its plist runs niwa unattended and unprivileged" sh -c "
    /usr/bin/plutil -p '$HOME/Library/LaunchAgents/dev.drill.converge.plist' |
    grep -q 'no-privileged'"

# --- removing the declaration offers removal, never takes it --------
cat >"$HOME/.config/niwa/init.luau" <<'LUAU'
local niwa = require("@niwa")
LUAU
: >"$CALLS"
{ sleep 1; for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do printf 'a\n'; done; sleep 1; } | bounded 120 /usr/bin/script -q "$SANDBOX/orphan.log" \
    "$NIWA_BIN" pull >/dev/null 2>&1 || true
check 20 "accepting the orphan boots the job out" \
    grep -q "bootout" "$CALLS"
check 21 "the plist left launchd's folder" \
    sh -c "! test -f '$HOME/Library/LaunchAgents/dev.drill.converge.plist'"

echo "drill: services · all checks passed"

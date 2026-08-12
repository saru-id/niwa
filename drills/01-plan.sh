#!/bin/sh
# Drill: plan against a sandbox, from pending to converged.
#
# A config declares one file and two dock keys. The plan must see the
# pending work, touch nothing, and read as converged once the sandbox
# matches the declarations.

. "$(dirname "$0")/lib.sh"

echo "drill: plan"

config
cat >"$HOME/.config/niwa/init.luau" <<'EOF'
local niwa = require("@niwa")
niwa.file("~/.zshrc", { source = "@self/files/zshrc" })
niwa.dock { autohide = true, tilesize = 48 }
EOF
mkdir -p "$HOME/.config/niwa/files"
printf 'export EDITOR=nvim\n' >"$HOME/.config/niwa/files/zshrc"

niwa plan
check 1 "a fresh sandbox has pending work (exit 2)" test "$STATUS" -eq 2

check 2 "plan created nothing in the home" test ! -e "$HOME/.zshrc"
check 3 "plan wrote no journal" test ! -e "$HOME/.local/state/niwa/journal.json"

# Make the declarations true by hand.
printf 'export EDITOR=nvim\n' >"$HOME/.zshrc"
mkdir -p "$HOME/Library/Preferences"
cat >"$HOME/Library/Preferences/com.apple.dock.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>autohide</key><true/>
<key>tilesize</key><integer>48</integer>
</dict></plist>
EOF

niwa plan
check 4 "a machine that matches the config is converged (exit 0)" test "$STATUS" -eq 0

# Drift one value; the plan must notice exactly that.
cat >"$HOME/Library/Preferences/com.apple.dock.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>autohide</key><false/>
<key>tilesize</key><integer>48</integer>
</dict></plist>
EOF

niwa plan
check 5 "one drifted key is pending again (exit 2)" test "$STATUS" -eq 2
check 6 "the drifted file was not repaired by plan" grep -q "<false/>" "$HOME/Library/Preferences/com.apple.dock.plist"

echo "drill: plan · all checks passed"

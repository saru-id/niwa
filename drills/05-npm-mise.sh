#!/bin/sh
# Drill: npm globals and mise tools, through receipts and batches.
#
# npm is asked for its global root once and reads never touch it
# again; mise presence is its install directories. Each provider's
# pending names land in one invocation.

. "$(dirname "$0")/lib.sh"

echo "drill: npm and mise"

CALLS="$SANDBOX/calls.log"
BIN="$SANDBOX/bin"
NPM_ROOT="$SANDBOX/npm-root"
mkdir -p "$BIN" "$NPM_ROOT"

cat >"$BIN/npm" <<EOF
#!/bin/sh
echo "npm \$*" >>"$CALLS"
if [ "\$1" = "root" ]; then
    echo "$NPM_ROOT"
elif [ "\$1" = "install" ]; then
    shift; shift # drop install -g
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
if [ "\$1" = "use" ]; then
    shift; shift # drop use --global
    for request in "\$@"; do
        tool="\${request%%@*}"
        mkdir -p "$HOME/.local/share/mise/installs/\$tool/1.0.0"
    done
fi
exit 0
EOF
chmod 755 "$BIN/npm" "$BIN/mise"
export PATH="$BIN:/usr/bin:/bin"

config
cat >"$HOME/.config/niwa/init.luau" <<'EOF'
local niwa = require("@niwa")
niwa.npm.global { "@biomejs/biome", "typescript" }
niwa.mise.tool { node = "lts", rust = "stable" }
EOF

niwa apply --yes
check 1 "apply succeeds (exit 0)" test "$STATUS" -eq 0
check 2 "both npm packages landed in one invocation" \
    grep -q "npm install -g @biomejs/biome typescript" "$CALLS"
check 3 "both mise tools landed in one invocation" \
    grep -q "mise use --global node@lts rust@stable" "$CALLS"
check 4 "the scoped package's receipt is its package.json" \
    test -f "$NPM_ROOT/@biomejs/biome/package.json"
check 5 "mise receipts are its install directories" \
    test -d "$HOME/.local/share/mise/installs/node"

niwa plan
check 6 "everything is converged afterwards (exit 0)" test "$STATUS" -eq 0

niwa undo --yes
check 7 "undo unwinds through both providers" \
    sh -c "grep -q 'npm uninstall -g' '$CALLS' && grep -q 'mise unuse --global' '$CALLS'"

echo "drill: npm and mise · all checks passed"

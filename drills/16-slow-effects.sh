#!/bin/sh
# Drill: a slow installer must not kill the run.
#
# The config's own code runs on a ten-second clock; the effects the
# engine drives (installers, downloads) carry their own deadlines and
# can take minutes. A brew that needs eleven seconds, followed by
# more script, must not trip the config clock.

. "$(dirname "$0")/lib.sh"

echo "drill: slow effects"

BIN="$SANDBOX/bin"
mkdir -p "$BIN"
export HOMEBREW_PREFIX="$SANDBOX/brew"
mkdir -p "$HOMEBREW_PREFIX/Cellar"
cat >"$BIN/brew" <<EOF
#!/bin/sh
case "\$1" in
install)
    sleep 11
    shift
    for name in "\$@"; do
        mkdir -p "$HOMEBREW_PREFIX/Cellar/\$name/1.0.0"
        echo '{"installed_on_request":true}' \
            >"$HOMEBREW_PREFIX/Cellar/\$name/1.0.0/INSTALL_RECEIPT.json"
    done
    ;;
esac
exit 0
EOF
chmod 755 "$BIN/brew"
export PATH="$BIN:$STUBS:/usr/bin:/bin"

config
cat >"$HOME/.config/niwa/init.luau" <<'LUAU'
local niwa = require("@niwa")
niwa.brew.formula { "slowpoke" }
-- The file after the batch is the barrier: the install must land,
-- slowly, while the script still has lines to run.
niwa.file("~/.after-the-wait", { content = "made it" })
LUAU

niwa apply --yes --dirty
check 1 "an eleven-second install does not kill the run (exit 0)" \
    test "$STATUS" -eq 0
check 2 "the slow install landed" \
    test -d "$HOMEBREW_PREFIX/Cellar/slowpoke"
check 3 "the script kept running after the wait" \
    test -f "$HOME/.after-the-wait"

echo "drill: slow effects · all checks passed"

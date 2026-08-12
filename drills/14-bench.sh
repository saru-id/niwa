#!/bin/sh
# Drill: the performance budget, on the design's own number.
#
# "A converged machine applies in under a second for roughly two
# hundred resources." This drill builds that machine, converges it,
# and times the converged pass. The assert allows two seconds: the
# budget is stated for a release build, and this drill times the
# debug one on shared hardware — a regression that matters blows
# through two seconds; scheduler noise does not.

. "$(dirname "$0")/lib.sh"

echo "drill: the budget"

config
{
    echo 'local niwa = require("@niwa")'
    i=1
    while [ "$i" -le 200 ]; do
        echo "niwa.file(\"~/.bench-$i\", { content = \"resource $i\" })"
        i=$((i + 1))
    done
} >"$HOME/.config/niwa/init.luau"

# CI progress: piped runs emit one plain line per interval, no
# control codes. Interval zero makes the cadence testable.
STATUS=0
NIWA_PROGRESS_EVERY=0 /usr/bin/perl -e 'alarm shift; exec @ARGV or die "exec: $!"' 60 \
    "$NIWA_BIN" apply --yes --dirty >"$SANDBOX/stdout" 2>"$SANDBOX/stderr" || STATUS=$?
check 1 "two hundred resources converge (exit 0)" test "$STATUS" -eq 0
check 2 "the two hundredth landed" test -f "$HOME/.bench-200"
check 2b "piped progress is plain lines with position and elapsed" \
    sh -c "grep -q ' of 200 · ' '$SANDBOX/stdout' &&
        ! grep -q \$'\\x1b' '$SANDBOX/stdout'"

START=$(/usr/bin/perl -MTime::HiRes=time -e 'printf "%d", time()*1000')
niwa apply --yes --dirty
END=$(/usr/bin/perl -MTime::HiRes=time -e 'printf "%d", time()*1000')
check 3 "the converged apply succeeds (exit 0)" test "$STATUS" -eq 0
ELAPSED=$((END - START))
echo "  converged apply: ${ELAPSED}ms for 200 resources"
check 4 "the converged pass stays inside the budget" test "$ELAPSED" -lt 2000

START=$(/usr/bin/perl -MTime::HiRes=time -e 'printf "%d", time()*1000')
niwa plan
END=$(/usr/bin/perl -MTime::HiRes=time -e 'printf "%d", time()*1000')
check 5 "a converged plan answers 0" test "$STATUS" -eq 0
ELAPSED=$((END - START))
echo "  plan: ${ELAPSED}ms for 200 resources"
check 6 "plan stays inside the same budget" test "$ELAPSED" -lt 2000

echo "drill: the budget · all checks passed"

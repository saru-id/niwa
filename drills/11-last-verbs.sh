#!/bin/sh
# Drill: init, the dashboard, tag, history, export, migrate, self,
# and uninstall.
#
# A fresh machine gets a starter config that already describes it,
# and the skeleton checks clean on arrival. Plain `niwa` answers in
# one screen. A tag set by hand flips a config branch on the next
# apply and rides along in the stamp. history browses the applies,
# export renders the machine as a document, and uninstall removes
# the tool while the machine stands exactly as it is.

. "$(dirname "$0")/lib.sh"

echo "drill: the last verbs"

BIN="$SANDBOX/bin"
mkdir -p "$BIN"
cat >"$BIN/scutil" <<'EOF'
#!/bin/sh
echo "drillbox"
EOF
chmod 755 "$BIN/scutil"

# A fake brew prefix with one requested formula, one dependency, and
# one cask: the scan must surface jq and kitty and skip the dependency.
export HOMEBREW_PREFIX="$SANDBOX/brew"
mkdir -p "$HOMEBREW_PREFIX/Cellar/jq/1.7.1" \
    "$HOMEBREW_PREFIX/Cellar/oniguruma/6.9.9" \
    "$HOMEBREW_PREFIX/Caskroom/kitty/0.32.0"
echo '{"installed_on_request":true}' \
    >"$HOMEBREW_PREFIX/Cellar/jq/1.7.1/INSTALL_RECEIPT.json"
echo '{"installed_on_request":false}' \
    >"$HOMEBREW_PREFIX/Cellar/oniguruma/6.9.9/INSTALL_RECEIPT.json"

cat >"$BIN/brew" <<EOF
#!/bin/sh
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
esac
exit 0
EOF
chmod 755 "$BIN/brew"
export PATH="$BIN:$STUBS:/usr/bin:/bin"

# --- init: the starter config describes the machine it scanned ------
niwa init
check 1 "init succeeds on a fresh machine (exit 0)" test "$STATUS" -eq 0
CONFIG="$HOME/.config/niwa"
check 2 "the skeleton is complete" sh -c "
    test -f '$CONFIG/init.luau' &&
    test -f '$CONFIG/.luaurc' &&
    test -f '$CONFIG/modules/inbox.luau' &&
    test -d '$CONFIG/files' && test -d '$CONFIG/secrets'"
check 3 "the scan surfaced the requested formula, not the dependency" \
    sh -c "grep -q '\"jq\"' '$CONFIG/modules/cli.luau' &&
        ! grep -q oniguruma '$CONFIG/modules/cli.luau'"
check 4 "the scan surfaced the cask" grep -q '"kitty"' "$CONFIG/modules/apps.luau"
check 5 "the host file names this machine" \
    grep -q 'niwa.hostname("drillbox")' "$CONFIG/hosts/drillbox.luau"
check 6 "the editor types are installed where .luaurc points" \
    sh -c "grep -q 'niwa/types' '$CONFIG/.luaurc' &&
        test -f '$HOME/.local/share/niwa/types/init.luau'"
check 7 "the watcher plist exists and launchd loaded it" \
    sh -c "test -f '$HOME/Library/LaunchAgents/rs.niwa.watcher.plist' &&
        grep -q launchctl '$SANDBOX/system.log'"
check 8 "the config is a git repository" test -d "$CONFIG/.git"

niwa check
check 9 "the generated skeleton checks clean (exit 0)" test "$STATUS" -eq 0

niwa init
check 10 "a second init refuses (exit 1)" test "$STATUS" -eq 1
check 11 "the refusal says a config exists" \
    grep -q "already holds a config" "$SANDBOX/stderr"

# --- the dashboard: one screen, no keys when piped ------------------
niwa
check 12 "plain niwa answers (exit 0)" test "$STATUS" -eq 0
check 13 "the headline names the machine and its size" \
    grep -q "niwa · drillbox · .* resources" "$SANDBOX/stdout"
check 14 "pending work shows on the screen" grep -q "would change" "$SANDBOX/stdout"
check 15 "piped output carries no key hints" \
    sh -c "! grep -q 'quit' '$SANDBOX/stdout'"

# --- tag: set before the apply, so the stamp carries it -------------
niwa tag
check 16 "no tags yet" grep -q "no tags" "$SANDBOX/stdout"
niwa tag work
check 17 "a tag is set (exit 0)" test "$STATUS" -eq 0
check 18 "the tag lives beside the journal" \
    grep -qx "work" "$HOME/.local/state/niwa/tags"
niwa tag "not a tag"
check 19 "spaces are refused (exit 1)" test "$STATUS" -eq 1

# --- apply the starter, then read the machine back ------------------
git -C "$CONFIG" -c user.name=drill -c user.email=drill@test \
    -c commit.gpgsign=false add -A
git -C "$CONFIG" -c user.name=drill -c user.email=drill@test \
    -c commit.gpgsign=false commit -qm "starter"

niwa apply --yes
check 20 "the starter applies (exit 0)" test "$STATUS" -eq 0
check 21 "apply installed the one formula init added" \
    test -d "$HOMEBREW_PREFIX/Cellar/luau-lsp"
check 22 "the stamp carries the tag" \
    grep -q 'tags = \["work"\]' "$CONFIG/state/drillbox.toml"

niwa
check 23 "the dashboard settles to in sync" grep -q "in sync" "$SANDBOX/stdout"

{ sleep 1; printf 'H\n'; sleep 1; } | /usr/bin/script -q "$SANDBOX/menu.log" \
    "$NIWA_BIN" >/dev/null 2>&1 || true
check 23b "an uppercase H still opens history" grep -q "undo reaches" "$SANDBOX/menu.log"

# --- the tag flips a config branch ----------------------------------
cat >>"$CONFIG/modules/inbox.luau" <<'EOF'
if niwa.machine.tags.work then
    niwa.file("~/.tagged", { content = "yes" })
end
EOF
git -C "$CONFIG" -c user.name=drill -c user.email=drill@test \
    -c commit.gpgsign=false commit -qam "tag branch"
niwa apply --yes
check 24 "the tagged branch applied" grep -qx "yes" "$HOME/.tagged"

niwa tag work --remove
check 25 "the tag is removed" sh -c "! grep -qx work '$HOME/.local/state/niwa/tags'"

# --- history: the applies before the last one -----------------------
niwa history
check 26 "history answers (exit 0)" test "$STATUS" -eq 0
check 27 "the newest apply is where undo reaches" \
    grep -q "#2 .*undo reaches this one" "$SANDBOX/stdout"
check 28 "the first apply is still in the story" grep -q "#1 " "$SANDBOX/stdout"

# --- export: the machine as a document ------------------------------
niwa export
check 29 "export without a format refuses (exit 1)" test "$STATUS" -eq 1
niwa export --markdown
check 30 "the document is titled by the machine" grep -q "^# drillbox" "$SANDBOX/stdout"
check 31 "the document lists resources under their modules" \
    sh -c "grep -q '^## cli' '$SANDBOX/stdout' &&
        grep -q 'brew.formula:jq' '$SANDBOX/stdout'"

# --- migrate and self: honest about 0.1.0 ---------------------------
niwa migrate
check 32 "migrate answers: nothing is deprecated (exit 0)" \
    sh -c "test $STATUS -eq 0 && grep -q 'nothing to migrate' '$SANDBOX/stdout'"
niwa self update
check 33 "self update is honest about no channel (exit 1)" \
    sh -c "test $STATUS -eq 1 && grep -q 'no release channel' '$SANDBOX/stdout'"

# --- uninstall: the machine stands, the journal survives ------------
INST="$SANDBOX/inst"
mkdir -p "$INST"
cp "$NIWA_BIN" "$INST/niwa"
STATUS=0
/usr/bin/perl -e 'alarm shift; exec @ARGV or die "exec: $!"' 60 \
    "$INST/niwa" uninstall >"$SANDBOX/stdout" 2>"$SANDBOX/stderr" || STATUS=$?
check 34 "uninstall succeeds (exit 0)" test "$STATUS" -eq 0
check 35 "the binary, watcher, and shared data are gone" sh -c "
    ! test -e '$INST/niwa' &&
    ! test -e '$HOME/Library/LaunchAgents/rs.niwa.watcher.plist' &&
    ! test -e '$HOME/.local/share/niwa'"
check 36 "the journal and the applied file survive" sh -c "
    test -f '$HOME/.local/state/niwa/journal.json' && test -f '$HOME/.tagged'"

cp "$NIWA_BIN" "$INST/niwa"
STATUS=0
/usr/bin/perl -e 'alarm shift; exec @ARGV or die "exec: $!"' 60 \
    "$INST/niwa" uninstall --purge >"$SANDBOX/stdout" 2>"$SANDBOX/stderr" || STATUS=$?
check 37 "uninstall --purge removes the journal too" sh -c "
    test $STATUS -eq 0 && ! test -e '$HOME/.local/state/niwa'"

echo "drill: the last verbs · all checks passed"

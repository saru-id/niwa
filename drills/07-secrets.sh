#!/bin/sh
# Drill: secrets and sealing, end to end.
#
# A missing secret fails the plan naming every place it looked. A
# value sealed into the repo renders into a file at apply time and
# never earlier. The archive of a secret-bearing file is itself
# sealed. The escrowed key crosses to a second machine on one
# passphrase. The keychain is asked through `security`, stubbed here.

. "$(dirname "$0")/lib.sh"

echo "drill: secrets"

BIN="$SANDBOX/bin"
CALLS="$SANDBOX/calls.log"
mkdir -p "$BIN"
cat >"$BIN/security" <<EOF
#!/bin/sh
echo "security \$*" >>"$CALLS"
# Only the account "kc-token" exists in this drill's keychain.
case "\$*" in
*"-a kc-token -w") echo "from-the-keychain"; exit 0 ;;
*"-a kc-token") exit 0 ;;
*) exit 44 ;;
esac
EOF
chmod 755 "$BIN/security"
export PATH="$BIN:$STUBS:/usr/bin:/bin"

config
cat >"$HOME/.config/niwa/init.luau" <<'EOF'
local niwa = require("@niwa")
local token = niwa.secret("github-token")
niwa.file("~/.netrc", {
  content = niwa.render("machine api.github.com login me password {token}",
                        { token = token }),
  mode = "600",
})
EOF

# --- a missing secret fails the plan, naming the places --------------
niwa plan
check 1 "a missing secret fails the plan (exit 1)" test "$STATUS" -eq 1
check 2 "the failure names the keychain" grep -q "keychain" "$SANDBOX/stderr"
check 3 "the failure names the sealed file" grep -q "github-token.age" "$SANDBOX/stderr"
check 4 "nothing was written" test ! -e "$HOME/.netrc"

# --- seal a value into the repo, apply, verify -----------------------
niwa add secret github-token <<'EOF'
hunter2
EOF
check 5 "add secret seals the value (exit 0)" test "$STATUS" -eq 0
check 6 "the sealed file is ciphertext" \
    sh -c "! grep -q hunter2 '$HOME/.config/niwa/secrets/github-token.age'"

niwa apply --yes --verify
check 7 "apply with the sealed secret verifies clean (exit 0)" test "$STATUS" -eq 0
check 8 "the rendered file holds the resolved value" \
    grep -q "password hunter2" "$HOME/.netrc"
check 9 "the rendered file wears its mode" \
    test "$(stat -f %Lp "$HOME/.netrc")" = "600"

# --- the archive of a secret-bearing file is itself sealed ------------
printf 'machine api.github.com login me password my-hand-edit\n' >"$HOME/.netrc"
niwa apply --yes
check 10 "a hand edit on the rendered file stays protected" \
    grep -q "my-hand-edit" "$HOME/.netrc"

niwa apply --yes --force
check 11 "apply --force re-renders the file" grep -q "password hunter2" "$HOME/.netrc"
check 12 "the displaced bytes were archived sealed, not in the clear" \
    sh -c "! grep -rq my-hand-edit '$HOME/.local/state/niwa/archive'"
check 13 "the archive really is an age file" \
    sh -c "grep -rlq age-encryption '$HOME/.local/state/niwa/archive/file:~_s.netrc'"

niwa undo --yes
check 14 "undo decrypts the sealed archive and restores the hand edit" \
    grep -q "my-hand-edit" "$HOME/.netrc"

# --- a rendered file is one-way: pull refuses, names the template ---
niwa apply --yes --force
check 14b "the rendered file is acknowledged again (exit 0)" test "$STATUS" -eq 0
printf 'machine api.github.com login me password another-edit\n' >"$HOME/.netrc"
niwa pull --all
check 14c "pull refuses the rendered file, pointing at the template" \
    grep -q "template" "$SANDBOX/stdout"
check 14d "the live edit stayed out of the repo" \
    sh -c "! grep -rq another-edit '$HOME/.config/niwa'"

# --- doctor --deep proves the sealed archives still decrypt ---------
niwa doctor --deep
check 14e "healthy sealed archives pass doctor --deep (exit 0)" test "$STATUS" -eq 0
BROKEN="$HOME/.local/state/niwa/archive/file:~_s.netrc/deadbeef"
printf 'age-encryption.org/v1\ngarbage\n' >"$BROKEN"
niwa doctor --deep
check 14f "a sealed archive that will not decrypt fails --deep (exit 1)" \
    test "$STATUS" -eq 1
rm -f "$BROKEN"

# --- the keychain is a resolution place, through security -------------
cat >"$HOME/.config/niwa/init.luau" <<'EOF'
local niwa = require("@niwa")
local token = niwa.secret { name = "kc-token", from = "keychain" }
niwa.file("~/.kc", {
  content = niwa.render("token={token}", { token = token }),
})
EOF
niwa apply --yes
check 15 "a keychain secret resolves through security (exit 0)" test "$STATUS" -eq 0
check 16 "the keychain value landed" grep -q "token=from-the-keychain" "$HOME/.kc"
check 17 "security was asked, on a leash" grep -q "find-generic-password" "$CALLS"

# --- when two places hold a secret, the keychain outranks the file --
printf 'from-the-age-file' | niwa add secret kc-token
cat >"$HOME/.config/niwa/init.luau" <<'LUAU'
local niwa = require("@niwa")
local token = niwa.secret("kc-token")
niwa.file("~/.kc2", {
  content = niwa.render("token={token}", { token = token }),
})
LUAU
niwa apply --yes
check 17b "the keychain outranks the sealed file" \
    grep -q "token=from-the-keychain" "$HOME/.kc2"

# --- the escrow crosses machines on one passphrase --------------------
niwa seal-key backup <<'EOF'
drill-passphrase
EOF
check 18 "seal-key backup writes the escrow (exit 0)" test "$STATUS" -eq 0
check 19 "the escrow is ciphertext in the repo" \
    sh -c "grep -q age-encryption '$HOME/.config/niwa/secrets/seal-key.age'"

# Machine two: same repo, fresh state.
rm -rf "$HOME/.local/state/niwa"
cat >"$HOME/.config/niwa/init.luau" <<'EOF'
local niwa = require("@niwa")
local token = niwa.secret("github-token")
niwa.file("~/.netrc2", {
  content = niwa.render("password {token}", { token = token }),
})
EOF

niwa seal-key restore <<'EOF'
wrong-passphrase
EOF
check 20 "the wrong passphrase does not open the escrow (exit 1)" test "$STATUS" -eq 1

niwa seal-key restore <<'EOF'
drill-passphrase
EOF
check 21 "the right passphrase restores the key (exit 0)" test "$STATUS" -eq 0

niwa apply --yes
check 22 "machine two resolves the sealed secret (exit 0)" test "$STATUS" -eq 0
check 23 "machine two rendered the same value" grep -q "password hunter2" "$HOME/.netrc2"

echo "drill: secrets · all checks passed"

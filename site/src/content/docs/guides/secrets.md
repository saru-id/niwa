---
title: Store and use a secret
description: Seal a value, reference it from the config, render it into a file, and escrow the key that opens it.
next:
  - href: /guides/dotfiles
    label: Manage dotfiles
    why: a rendered file is a dotfile with one rule of its own
  - href: /concepts/secrets
    label: Secrets
    why: it explains why a secret is opaque and where the masking rule comes from
---

## When to use this

Use a secret when a value must reach a file on the machine but must never
sit in the config repo in the clear: a token, a password, a license key.

## What must already be true

- Nothing. The sealing key is created the first time you seal something.
- The config repo is not mid-merge. niwa never writes into a tree whose
  merge is unfinished.

## Store it

```shell
niwa add secret github-token
```

The value is read from stdin, never from an argument, so it stays out of
your shell history. niwa seals it and writes `secrets/github-token.age`
in the config repo. Commit that file: it is ciphertext, and it is what
lets the repo rebuild a machine.

The keychain is the other place niwa reads, and macOS owns it.

```shell
security add-generic-password -s niwa -a github-token -w
```

The service is `niwa` and the account is the secret's name. A value
stored there stays on the machine, which is what you want for a secret
that should not travel with the repo.

## Reference it

```luau
local token = niwa.secret("github-token")

niwa.file("~/.netrc", {
  content = niwa.render("machine api.github.com login {user} password {token}", {
    user = "you",
    token = token,
  }),
  mode = "600",
})
```

`niwa.secret` returns an opaque handle, not a value. It searches three
places in order: the keychain, then `secrets/<name>.age` in the config,
then an external manager. No external manager is configured in this build,
so the third place searches nothing today. A table form pins the search to
one place and searches nowhere else:

```luau
local pinned = niwa.secret { name = "github-token", from = "keychain" }
```
A secret that is nowhere fails the plan, before anything changes, and the
failure lists the places it looked and both commands above.

## Render it into a file

`niwa.render` fills `{name}` placeholders. Every placeholder needs a
value: a string, a number, or a secret. A missing value, an unclosed
brace, or a stray brace fails the check, naming the template.

`mode` is a string of octal digits. Write it. A resolved secret must not
land world-readable, so a file holding one and declaring no mode is
written `0600`, but a mode you declared is one the plan compares against.

Rendered files are one way. `pull` cannot map live bytes back to a
template's inputs, so it refuses the file by name and points at the
template. Edit the source, never the output.

## What the masking rule promises

- The value never enters the config. What niwa stores is the template and
  the secret's name, so the plan, the log, the report and the journal
  have nothing to leak.
- Secrets resolve at apply time and nowhere else. A plan decides whether
  a rendered file is in sync from the journal and the bytes on disk, and
  `plan --diff` leaves rendered content as a name rather than a diff. The
  journal records that bytes changed, never what they became.
- The undo archive for a secret-bearing file is sealed with the same key
  the file was, so an undo cannot write out plaintext.
- `niwa check` scans the repo for credentials, `files/` included, and the
  same gate runs on every `pull`.

## Back the key up

```shell
niwa seal-key backup
```

It asks for a passphrase, encrypts this machine's sealing key in process,
and writes `secrets/seal-key.age`. The repo only ever holds ciphertext, so
commit it. There has to be a key to escrow, so seal one secret first.

On the next machine, `niwa seal-key restore` reads that file and one
passphrase and writes the key back. Losing every machine then costs a
passphrase rather than the files. `niwa doctor` checks that every secret
still resolves, and `--deep` opens the sealed archives too, because an
archive nobody can read is a broken undo.

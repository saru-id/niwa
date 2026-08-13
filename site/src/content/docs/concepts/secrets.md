---
title: Secrets
description: A secret is a typed handle, not a value. Where niwa looks for it, why it never prints, and what sealing protects.
next:
  - href: /guides/secrets
    label: Store and use a secret
    why: the same rules, written as steps you can follow
  - href: /concepts/machines
    label: Many machines
    why: the sealed file travels in the repo, and the key does not
---

A secret is the one value a config must use and must never hold. niwa
handles that with a type: `niwa.secret` returns a handle, and the value
behind it appears only inside the apply that writes it.

```luau
local token = niwa.secret("github-token")

niwa.file("~/.netrc", {
  content = niwa.render("machine api.github.com login {user} password {token}", {
    user = niwa.machine.owner,
    token = token,
  }),
})
```

## Typed and opaque

The handle carries the secret's name and nothing else. It resolves at
apply time, never at plan time, and never into the config.

`niwa.render` knows which of its values are secret, which is what lets a
rendered file be planned without being read. The spec niwa stores holds
the template and, per placeholder, the plain value or the secret's name.

## Where niwa looks

Resolution is ordered and explicit. `niwa.secret(name)` searches the
macOS keychain first, under the service name `niwa`, then
`secrets/<name>.age` in the config repo, then an external manager when
one is configured.

The order is a default, not a rule. `niwa.secret` also takes a table,
and `from` in that table names one place and searches nowhere else:
`niwa.secret { name = "github-token", from = "keychain" }`.

A missing secret fails the plan, not the apply, and the error lists the
places niwa searched. At 0.1.0 two of the three answer: the keychain and
the repo. No external manager is configured, and the error says where it
looked rather than implying a third.

A sealed file that exists and will not open is a different problem, and
the message says so: it points at the sealing key, and at
`niwa seal-key restore`.

## A secret never prints

One rule, held everywhere the value could otherwise surface.

- The plan shows a rendered file's shape, never its content. Full file
  diffs are drawn for files whose bytes are knowable before the run, and
  a rendered file stays a name.
- The journal records that the bytes changed, by digest. It never
  records a value.
- The archive of a secret-bearing file is sealed, on the apply path and
  on the undo path alike.
- `niwa pull` refuses rendered files by name. They are one way, because
  reading one back would mean reading the secret out of it.

## Files rendered from secrets are private

When a file's content comes from a render that used a secret and the
config declares no `mode`, niwa writes the file `0600`. A resolved
secret is never left world-readable by omission. A declared mode is
obeyed as written, and a mode that later differs reads as drift.

## Sealing, and the key

This machine's sealing key is `~/.local/state/niwa/seal.key`. niwa
generates it on first use, with owner-only permissions set before the
file has the name anything else could open it by.

`secrets/<name>.age` in the repo is sealed to that key, and so is every
archive of a secret-bearing file. The repo holds ciphertext; the machine
holds the key.

`niwa seal-key backup` escrows the key at `secrets/seal-key.age`,
passphrase-encrypted in process before anything touches disk, and
`niwa seal-key restore` reads it back on another machine. Losing every
machine then costs one passphrase rather than the files.

## The gate

`niwa check` scans the config repo, `files/` included, for credentials
that should not be committed. Detection is patterns plus entropy, so a
credential shape nobody listed is still caught.

Four things are skipped. `secrets/` holds ciphertext by design.
`niwa.lock` is full of hashes, which are exactly the kind of string an
entropy check exists to catch. `.luaurc` and `.git` are machinery. A
dot-named file under `files/` is scanned like any other source.

The same gate runs on every `niwa pull`, because the late edit that
exported a token has to be caught before it becomes a commit. The
offending lines are named and held back, and the rest of the pull
proceeds.

`niwa doctor` resolves every secret the config asked for and names the
ones it cannot find. `doctor --deep` checks the sealed archives decrypt.

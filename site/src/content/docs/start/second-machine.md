---
title: Set up a second machine
description: One line on a new Mac clones the config, restores the sealing key, and reaches the state the first machine reached.
next:
  - href: /concepts
    label: Concepts
    why: the walk is done, and the model behind it is what makes it repeatable
---

The second machine is the first machine's config, on new hardware. There is no
export step and no bundle, because sharing is `git push`.

## One line

```shell
curl -fsSL niwa.rs | sh -s -- --config github:you/dotfiles
```

It installs the binary and clones the repo to `~/.config/niwa`. With a terminal
behind the pipe it then restores the sealing key, when the repo holds one, and
runs `niwa apply`.

Do not run `niwa init` here. `init` writes a starter config, runs once per
machine, and refuses a directory that already holds one. The clone is this
machine's config.

## The sealing key

Secrets are sealed to a key that lives on the machine, not in the repo. Machine
two needs that key before a sealed secret can resolve.

Back it up once, on machine one:

```shell
niwa seal-key backup
```

That asks for a passphrase, encrypts the key with it in memory, and writes
`secrets/seal-key.age` in the config repo. The repo only ever holds ciphertext.
Commit it.

On machine two the installer runs the restore itself when the escrow is in the
repo. Run it by hand when it is not:

```shell
niwa seal-key restore
```

One passphrase, and the key is on the machine.

## The plan, and the one question

apply prints the same three phases it prints anywhere: the plan, then the
manual steps only a person can do, then the steps that need administrator
rights. Then it asks once. The checklist prints at the top on purpose, so the
work only you can do overlaps the work the machine is doing.

Nothing is applied before you answer. A cancel exits 1 and changes nothing.

## Why the versions match

`niwa.lock` is committed, so machine two resolves to the versions machine one
resolved, not to whatever `latest` means today. The lock covers what pins
well: releases fetched by tag, toolchains through mise, and shared modules by
hash.

It states what it does not cover just as plainly. Homebrew installs whatever
the formula says today, and niwa does not pretend otherwise.

`niwa update` re-resolves the lock deliberately and shows the diff before
writing it, so a version bump is a commit you reviewed. The lock also records
the niwa version that last wrote it: an older niwa meeting a newer lock refuses
and says to update niwa first, rather than guessing.

## Where the machines differ

Per-machine variance lives in `hosts/<machine>.luau`, which `niwa.host()` loads
last. Later declaration wins, merged per key, so a host file overriding a
module is an override and not a conflict.

Every apply writes one small file, `state/<machine>.toml`, committed with the
config. It records the machine, the time, the config commit, whether the tree
was dirty, the niwa version, and the resource count. `niwa machines` reads
those stamps and answers the only fleet question that matters: which machines
are behind.

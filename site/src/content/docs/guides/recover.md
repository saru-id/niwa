---
title: Recover a machine
description: "Rebuild a Mac from the config repo: one line, one passphrase, the plan, the apply, and two commands that prove the result."
next:
  - href: /concepts/machines
    label: Many machines
    why: it explains the stamp, the lock, and why a clone is enough to rebuild from
---

## When to use this

Use this walk for a machine that is gone: a failed drive, a stolen laptop,
a wipe you chose. It is also the walk for a machine that is new, because
niwa does not tell the two apart.

## What must already be true

All three are true days before you need them, or not at all.

- The config repo is pushed, with `niwa.lock` in it.
- If you seal secrets, `secrets/seal-key.age` is committed and you know
  its passphrase.
- You can reach the repo from the new machine.

## One line

```shell
curl -fsSL niwa.rs | sh -s -- --config github:you/dotfiles
```

`github:owner/repo` is the shorthand and `@ref` pins one; anything else
reaches git as written, so an ssh URL or a path works too.

The installer refuses anything that is not macOS, and waits for the
Command Line Tools, because the config repo needs git. It verifies the
release checksum before it touches the machine: a mismatch installs
nothing. It puts one binary at `~/.local/bin/niwa` and wires PATH exactly
once in your `.zshrc`, behind a marker comment, so running it again
replaces the binary and changes nothing else. Then it clones the config
to `~/.config/niwa`, leaving any config already there alone. With a
terminal behind it, the installer walks on through the two steps below.
With none, it prints them instead.

## One passphrase

```shell
niwa seal-key restore
```

`secrets/seal-key.age` is the repo's copy of your sealing key, encrypted
to a passphrase. Restoring writes it into this machine's state directory,
readable only by you. Without it, every sealed secret fails the plan, and
the failure says the file is there and did not decrypt.

## The plan

```shell
niwa plan
```

Read it. This is a machine with nothing on it, so the plan is long, and
the first apply is the one worth reading in full. If your config pulls in
a shared module, run `niwa update` first: the lock names the module, this
machine does not have its bytes yet, and the run says so rather than
fetching behind a plan.

`plan` exits 0 in sync, 2 with changes pending, 1 on an error. On a fresh
machine, 2 is the answer you want.

## The apply

```shell
niwa apply
```

It shows the plan, asks once, and executes. The manual checklist prints
at the top of a long run, so the permissions and sign-ins you do by hand
overlap with the installs instead of waiting behind them. Nothing asks
you for a password on niwa's behalf: steps that need administrator rights
are listed up front and run with your own rights.

## Prove it

```shell
niwa apply --verify
```

`--verify` applies and then re-checks everything. A second pass that
changes nothing is the property the whole tool rests on. Anything still
reporting a change is not idempotent: niwa names the resource and the
line that declared it, then exits 1.

```screen
fixture: plan_converged_piped
command: niwa plan
```

```shell
niwa doctor --deep
```

`doctor` asks whether niwa itself is healthy: the journal reads at its
schema, the archives open, the config loads clean, every secret resolves,
the lockfile agrees with the declarations. `--deep` pays for the
expensive versions, including decrypting sealed archives. Exit 0 means
every check passed.

On a machine whose config arrived by clone, `doctor` notes that the
watcher is not installed. That is a note, not a failure: the watcher
notices and notifies, and nothing in this walk depends on it.

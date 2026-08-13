---
title: Adopt a machine you already use
description: Point niwa at a Mac with years of state on it, and lose none of that state.
next:
  - href: /start/second-machine
    label: Set up a second machine
    why: an adopted config is the thing a second machine clones
---

The hard case is not a fresh Mac. It is the machine you have used for three
years, and this page is the order that keeps what is already on it.

## The rule that protects you

One rule governs every file niwa writes. When the bytes on disk are exactly the
bytes the journal says niwa last wrote, apply replaces them. When they are
bytes niwa never wrote, they are yours, and apply does not overwrite them. It
names the file, prints the diff it refused to guess about, counts it as
protected in the summary, and carries on with the rest of the run. Two ways
forward are printed with it: pull the edits home, or apply that one file with
`--force`.

On a first apply nothing is acknowledged yet, so every file that differs is
protected. That is the same rule, seen at the one moment when the journal is
empty.

Whatever is replaced is archived first, under `~/.local/state/niwa/archive/`,
so `niwa undo` can bring it back. Archives are kept for ninety days, and any
archive an apply in the journal still needs is kept regardless of age.

## First, capture what is already here

```shell
niwa pull --all
```

`pull` is apply's inverse: machine to config. `--all` stages every finding at
once and leaves the reading to git.

```screen
fixture: the_pull_screen_stages_an_unmanaged_package
command: niwa pull --all
```

It finds five kinds of thing: a governed file whose live bytes moved, a
governed preference whose value moved, a changed key in one of the eight System
Settings domains it watches, a package with a receipt and no declaration, and a
declaration that vanished while its work is still on the machine.

Two limits are worth knowing before you read the diff. A key in a watched
domain that niwa has never seen is learned as a baseline, silently, and only a
later change to it becomes a proposal, so a first pull does not sweep your whole
System Settings into the config. And a rendered file is one way: live bytes
cannot map back to a template's inputs, so pull refuses it by name.

## Then, read what it staged

```shell
git diff
```

pull writes to the working tree and stops there. Staging is yours. Keep what
you meant, drop what you did not, and commit.

Plain `niwa pull`, with no `--all`, walks the same findings one at a time and
offers four answers: apply, edit, never, skip. `never` is remembered per
machine, and that exact proposal is not made again.

## Then, apply one decision at a time

```shell
niwa apply --interactive
```

Interactive apply steps through every remaining difference and prints its keys
on each one: `y` applies it, `s` skips it, `d` shows the diff, `a` accepts
everything left, `q` quits.

For a file you decided the config should own, lift its protection by name:

```shell
niwa apply --force '~/.zshrc'
```

A target is the file's path as you declared it, which is what the plan prints.
Quote it: an unquoted tilde is expanded by the shell into an absolute path that
matches nothing. A named target lifts one file, and bare `--force` covers the
whole run.

The same order adopts a config someone else published, one decision at a time.

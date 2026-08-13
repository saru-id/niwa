---
title: Many machines
description: The config repo is the transport, and git moves it. What each machine stamps, how a host file overrides a module, and what the lockfile pins.
next:
  - href: /concepts/config
    label: The config and its modules
    why: the layout a host file overrides, in one page
  - href: /reference/cli/machines
    label: machines
    why: the command whose screen this page reads
---

Two machines share a config the way two checkouts share any repository.
There is no branch model and no merge machinery of niwa's own, because
none of that is needed once the config is an ordinary git repo.

## The git boundary

Sharing is `git push` and `git pull`. niwa does not run them for you. It
never commits, never pushes, never merges, and never resolves a
conflict.

It does read the repository, because two facts belong in the record: the
commit the config was on when apply ran, and whether the tree was dirty
at the time. That probe ignores `state/`, since the stamps every apply
writes would otherwise report a dirty tree forever. `niwa init` runs
`git init` once, so the config is a repository from its first minute.

The boundary has one refusal. A config tree in the middle of a merge is
nobody's config, so apply, pull, and add stop with a plain message and
change nothing. A tool that edits your config must not guess which side
of a conflict you meant.

## This machine, and what it knows about itself

Identity keys on a stable hardware identifier, not the computer name.
Renaming a Mac would otherwise orphan its host file and its stamp in
silence. When the identifier stamps under a name that is no longer
current, niwa says so and names the two files to rename.

The config can read seven facts about the machine it runs on:
`niwa.machine.name`, `.owner`, `.arch`, `.os`, and `.tags`, plus
`niwa.brew.prefix` and `niwa.home`. Tags are the one you author, through
`niwa tag`. Queries are memoised for the run, so twenty guards asking
one question cost one answer.

## The stamp

The journal stays local: it holds byte archives, and every machine would
rewrite it. What crosses the repo is one small file per machine,
`state/<machine>.toml`, committed like anything else.

It records the machine identifier, the display name, when apply last
ran, the config commit with a dirty marker, the niwa version, the
resource count, and the machine's tags when it has any. One file per
machine means two machines never write the same line, and between them
the files answer the only fleet question that matters: which machines
are behind.

```screen
fixture: the_machines_screen_reads_the_fleet_from_stamps
command: niwa machines
```

Each row is one stamp: the machine, when it last applied, the commit it
applied and how far that trails the config's head, and how many
resources it declared. A `*` marks the machine you are on, and a stamp
written before the config had a commit reads `(no commit)`.

## Machines differ through host files

`init.luau` ends with `niwa.host()`, which loads
`hosts/<this machine>.luau` if that file exists. It loads last, and the
position is the whole override rule. A module, then a host file:

```luau
niwa.dock { autohide = true, tilesize = 48, apps = {} }
```

```luau
niwa.brew.cask { "steam", "spotify" }
niwa.dock { autohide = false }
```

Every machine reads the module. One machine reads the host file. Later
declaration wins, and it wins per key, so the host changes `autohide`
and leaves `tilesize` where the module put it.

Two modules setting the same key to different values is not an override.
It is a conflict, and `niwa check` reports it with both source
locations, because at that point nobody knows which one you meant.

## The lockfile

Anything niwa resolves by version records what it resolved to, in
`niwa.lock`, and the file is committed. Machine two gets the version
machine one resolved, not whatever "latest" means the day it runs.
`niwa update` re-resolves deliberately and shows the diff first.

The lock covers three things: release binaries fetched by tag, with
their version and hash; toolchains pinned through `mise`; and shared
modules loaded by `niwa.use`, by ref, commit, and hash. It also records
the niwa version that wrote it, so a lock written by a newer niwa is
refused with one sentence naming what to do, rather than read as a
guess.

What it does not claim matters as much. Homebrew formulae and casks
install whatever they say today, and global npm packages do the same.
Pinning them would mean fighting the model those managers are built on,
so niwa does not pretend to.

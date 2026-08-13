---
title: Your first config
description: niwa init writes a starter config that already describes this machine, and this page reads it file by file.
next:
  - href: /start/first-apply
    label: Your first apply
    why: a config is a claim until an apply makes it true
---

Open a new shell first, so the PATH line the installer wrote is in it.

```shell
niwa init
```

`init` runs once per machine, and refuses a config that already exists.

## What it wrote

It reads the machine first: the formulae Homebrew has on record as requested,
the casks it has installed, and this machine's name. Then it writes the whole
skeleton, empty rooms included.

```tree
label: ~/.config/niwa
init.luau — every module, in the order they run
.luaurc — the aliases your editor reads
niwa.lock — the versions, once something resolves one
modules/cli.luau — the formulae init found
modules/apps.luau — the casks init found
modules/shell.luau — shell, prompt, terminal
modules/dev.luau — toolchains and editors
modules/desktop.luau — dock, finder, the desktop
modules/system.luau — keyboard, trackpad, firewall
modules/services.luau — launchd agents, and brew's daemons
modules/inbox.luau — where accepted proposals land
hosts/<machine>.luau — this machine only, loaded last
files/ — sources for the files you declare
secrets/ — sealed secrets
```

Three things land outside the repo. The shipped types go to
`~/.local/share/niwa/types/init.luau`. The watcher is loaded, a launchd job
that notifies and never applies. The config directory becomes a git repository
on a branch named `main`.

## The files that matter

**`init.luau` is the entry point.** It requires each module in turn, and order
is execution order. Its last line is `niwa.host()`, which loads this machine's
host file when there is one. A require needs a literal string, so the
per-machine lookup goes through that call instead.

**`.luaurc` points your editor at the types.**

```json
{
  "languageMode": "strict",
  "aliases": {
    "niwa": "~/.local/share/niwa/types",
    "self": "."
  }
}
```

`@niwa` is the shipped API, `@self` is your repo. The same alias works in a
require and in a file source, so there is one path concept and not two.

**A module is also a group.** Output groups by module, and
`niwa apply --only desktop` runs one and leaves the rest as they stand. Two
modules setting the same key to different values is an error, and `niwa check`
reports it with both source locations. A host file overriding a module is the
supported way for machines to differ: later declaration wins, merged per key.

**`niwa.lock` is committed on purpose.** Anything version-resolved records what
it resolved to, so a second machine reaches the same versions.

## Reading a module

`modules/cli.luau` carries what the scan found, as one line:

```luau
niwa.brew.formula { "fd", "jq", "ripgrep" }
```

Most of the other modules hold a commented example of their own shape until you
write in them. `modules/dev.luau` is the exception: it declares `luau-lsp`, so
the repo installs the thing that makes editing it pleasant. Read the modules,
then commit the repo, because that first commit is what every later change is
read against.

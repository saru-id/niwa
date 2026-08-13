---
title: Schedule convergence
description: Declare a service that runs apply on a schedule, and decide first whether a machine should converge without you.
next:
  - href: /guides/recover
    label: Recover a machine
    why: the other unattended walk, and the one worth rehearsing
  - href: /concepts/watcher
    label: The watcher
    why: it explains why niwa notices things without ever applying them
---

## When to use this

niwa never decides to change your machine. The watcher notices and
notifies; applying is a person's call. There is one exception, and it is
the one you write yourself: a `niwa.service` that runs `apply --yes` on a
schedule. That is auto apply you declared, in the config it governs,
readable and revocable like any other block.

Declare it for a machine you rarely sit at, whose repo stays committed,
and whose changes you would accept without reading the plan first. Do not
declare it on the machine you work at daily. There the plan is the point,
and reading it costs one command.

## What must already be true

- The config tree is committed. `apply --yes` refuses a tree with
  uncommitted edits and names both ways out. Leave that refusal in place:
  it is what lets an unattended stamp be trusted.
- Nothing in the run needs administrator rights. niwa never asks for a
  password on your behalf, so pass `--no-privileged` and let those steps
  be skipped whole.
- Something pulls the repo. niwa applies the config on disk. Getting the
  new commit there is git's job.

## The declaration

```luau
niwa.service {
  label    = "dev.you.converge",
  program  = { "~/.local/bin/niwa", "apply", "--yes", "--no-privileged" },
  calendar = { hour = 9 },
  logs     = "~/.local/state/converge/",
}
```

`label` is a reverse-DNS name. It becomes the file name under
`~/Library/LaunchAgents` and the argument launchd is told to load.

`program` is the executable, then its arguments. Write the full path.
launchd expands nothing, so a bare command name is not found; niwa
expands the `~` when it writes the plist, and the installer puts the
binary at `~/.local/bin/niwa`.

`calendar` is one of exactly three schedules, alongside `interval` and
`keepalive`. Naming two fails the check, and the failure names all three.
`hour = 9` means every day at nine.

`logs` names a directory. niwa writes `out.log` and `err.log` inside it,
which is where the run's own account of itself lands.
[Manage services](/guides/services) covers the call in full.

Apply once by hand. The agent is a resource like any other: the plan
shows it, and the plist is owned, so a later edit to it reads as drift.

## What the scheduled run does

It plans, executes, and exits. Exit 0 means every step succeeded. Exit 1
covers an error, and it covers the refusal at a dirty tree.

Manual steps are never prompts. A permission or a `niwa.manual` entry
prints and the run carries on to the end, so nothing waits on a person
who is not there.

One apply runs at a time. If the schedule fires while you are applying by
hand, the scheduled run stops rather than waiting, and the next one picks
the work up.

It applies. It does not pull. Drift stays a proposal in the dashboard for
you to answer, because a machine writing your config back at you
unattended is a different decision, and not one niwa makes.

## Turning it off

Delete the block and commit. The next apply stops governing the agent,
and the agent becomes an orphan: still on the machine, no longer
declared. Removal is an offer, never an automatic. Run `niwa pull` and
answer it, and niwa boots the agent out and takes the plist with it.

`niwa pull --all` will not stage this one. Removal changes the machine, so
it waits for an interactive yes.

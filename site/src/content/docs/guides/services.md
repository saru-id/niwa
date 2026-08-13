---
title: Manage services
description: Declare a launchd agent with exactly one schedule, point it at its logs, and start a Homebrew service.
next:
  - href: /guides/custom-resource
    label: Write a custom resource
    why: when no built-in kind fits, you define the kind
  - href: /reference/api/services
    label: Services
    why: the three calls in full, with every field
---

## When to use this

Use this guide when something should run on a schedule, or should keep
running: a sync script every fifteen minutes, a backup at three, a
database that is up on every machine that declares it.

Two calls cover it. `niwa.service` declares an agent of your own.
`niwa.brew.service` starts a daemon Homebrew already packages.

## What must already be true

- The program exists on the machine before the agent runs it. If it is
  your own script, declare it first with `niwa.file` and let program
  order do the rest.
- The label is a reverse-DNS name. It becomes the plist's file name and
  the argument launchd is given, so nothing else is accepted.
- These are user agents. niwa declares launchd agents for your account,
  and nothing at the system level.

## Declare an agent

```luau
niwa.service {
  label = "dev.stefan.notes-sync",
  program = { "~/.local/bin/notes-sync", "--quiet" },
  interval = "15m",
  logs = "~/.local/state/notes-sync/",
}
```

`program` is a list: the executable, then its arguments. niwa expands
`~` when it writes the plist, because launchd expands nothing itself.

`logs` names a directory. niwa points the agent's standard output at
`out.log` inside it, and standard error at `err.log`.

## Exactly one schedule

Three fields can carry the schedule, and a declaration uses one of them.
Two is an error, and none is an error.

| Field | Shape | What launchd does |
| --- | --- | --- |
| `interval` | `"15m"` — a number and `ms`, `s`, `m`, or `h` | starts it again that often |
| `calendar` | `{ minute = …, hour = …, day = …, weekday = … }` | runs it when the fields match; the ones you leave out match anything |
| `keepalive` | `true` | starts it again whenever it stops |

```luau
niwa.service {
  label = "dev.stefan.repo-backup",
  program = { "~/.local/bin/repo-backup" },
  calendar = { hour = 3 },
}
```

That one runs every day at three, because `minute`, `day`, and
`weekday` are left open.

## What apply does with it

Apply writes the plist to `~/Library/LaunchAgents/<label>.plist`, loads
it, and kickstarts it when the definition changed. The plist is owned
like a file, so an edit made to it by hand is drift like any other, and
niwa compares the parsed values rather than the formatting.

Delete the declaration and the agent becomes an orphan: niwa offers to
remove it rather than removing it without asking. `undo` unloads the
agent and takes the plist back to what it replaced.

## Homebrew services

```luau
niwa.brew.service { "postgresql@16", "redis" }
```

Declaring the service implies the formula, so you never write both. The
check reads the plists Homebrew installs, and `undo` stops the service
and unregisters it.

A service is not optional. If a package may fail without stopping the
run, `optional = true` belongs on the formula, and the service stays a
plain declaration.

## Convergence on a schedule

An agent can run niwa itself, which is how unattended convergence is
declared rather than assumed. niwa never applies on its own, and the
watcher only notifies. [Schedule convergence](/guides/schedule-convergence)
walks that decision and its costs.

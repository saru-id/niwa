---
title: The watcher
description: A launchd job with no state and one word in its vocabulary. It notices things and says so. It never applies.
next:
  - href: /concepts/machines
    label: Many machines
    why: the same config across machines, and the stamp that says who is behind
  - href: /reference/cli/check
    label: check
    why: the verb the watcher runs, and the flag that makes it notify
---

The watcher is on by default and holds no state. It is a launchd agent whose
whole body is one invocation of the same binary you type:

```shell
niwa check --notify
```

That is the entire program. There is no socket, no protocol, and no resident
engine holding a model in memory, because there is nothing to hold. The config
repo and the journal are both on disk, and the CLI computes everything from
them on demand. A background process is worrying when it accumulates authority.
This one cannot, by construction.

**The watcher's entire vocabulary is notify. It never applies.** It also never
takes the apply lock, so it can never delay or interrupt an apply you just
started.

## What wakes it

launchd does the noticing. The job declares two paths and one timer.

| Trigger | What it is |
| --- | --- |
| The config repo | Save a module and the check runs against it. |
| `~/Library/Preferences` | A preference file changes and the survey runs. |
| A weekly firing | Monday at nine, carrying the upstream survey and the cheap half of `doctor`. |

Between firings, launchd holds repeated events for five seconds. Three
proposals in one edit become one notification, not three.

## It pings for exactly three things

- **Drift you just caused.** You changed something niwa governs, or something
  in a domain it watches, and there is a config line waiting for a decision.
- **A config error you just saved.** You learn in five seconds with a line
  number instead of at your next apply three days later. This is the only
  interrupting class, because it is the only one actively blocking you.
- **A rot finding worth a decision.** Something you declare no longer exists
  upstream, or one of niwa's own health checks fails.

Everything else waits. Outdated counts never ping. They sit in the dashboard
until you visit, which is the whole difference between a tool that informs you
and a tool that nags you.

## What counts as interesting is a filter, not a guess

Drift is computed per governed identity. An application that rewrites its whole
preference file on every launch, while the one key your config governs sits
untouched, is silence.

Beyond what your config already governs, the watcher volunteers proposals in a
short list of the domains behind System Settings. Those are compared against a
baseline file in niwa's state directory: a key it has never seen before is
learned quietly, and only a change to a key it already knew becomes a proposal.
A tool that proposed every key it had not seen before would produce noise
instead of decisions, and you would turn it off inside a week.

## Wanting unattended convergence anyway

That is a legitimate thing to want, and the answer is not a hidden setting. You
declare it, in the same config as everything else:

```luau
niwa.service {
  label = "dev.you.converge",
  program = { "niwa", "apply", "--yes", "--no-privileged" },
  calendar = { hour = 9 },
}
```

The difference between a tool that quietly applies behind your back and this
block is who decided, where it is written down, and how it is turned off. niwa
will not converge on its own, and it will not stop you from asking for exactly
that in code you can read.

## Where it lives

The agent is labeled `rs.niwa.watcher`, and its plist sits in
`~/Library/LaunchAgents` like any other user agent. `niwa init` writes and
loads it. `niwa uninstall` unloads and removes it. Notifications go through the
system's own notification service, and a machine that cannot post one stays
quiet: notifying is a courtesy, not a duty.

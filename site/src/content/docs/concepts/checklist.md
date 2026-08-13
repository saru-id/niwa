---
title: The checklist and manual steps
description: Some work on a Mac needs a person. niwa makes that work a checklist item, never a prompt in the middle of a run.
next:
  - href: /concepts/drift
    label: Drift and the write-back loop
    why: the other half of the loop, where the machine writes back to the config
  - href: /reference/api/human
    label: Manual steps
    why: the two calls that declare a checklist item, with their fields
---

Some things on macOS genuinely cannot be automated. Accessibility and Full
Disk Access grants, signing in to the App Store, turning on FileVault. A tool
that pretends otherwise loses your trust the first time it lies.

niwa answers with one law: **resources are never interactive.** Anything that
needs a person becomes a checklist item, and an apply always runs to
completion.

## Why a checklist and not a prompt

A prompt inside a run makes the run depend on a person at the keyboard. That
single dependency costs three things at once. The run can no longer be
scheduled. It can no longer finish while you are away. And it stops each time
it wants an answer, so the machine waits for you instead of working while you
work.

A checklist inverts that. Nothing in it blocks the apply, so the machine works
while you do. On a long run the checklist prints before the work starts, from
ten pending changes upward, which is where a run stops feeling instant. Below
that the list would arrive after the summary anyway.

## Being honest about permissions

The database behind macOS privacy grants is not reliably readable. So
`niwa.permission` is deliberately not a check. It is a checklist entry with a
deep link that opens the exact settings pane:

```luau
niwa.permission { app = "Ghostty", needs = "accessibility" }
```

niwa knows the panes for accessibility, full disk access, screen recording,
the microphone, the camera, and input monitoring. A pane it does not know gets
no link at all, rather than a link that might be wrong.

The acknowledgement is not permanent either. niwa records the world a step was
ticked in: the major version of macOS, and for a permission the install time of
the application bundle. Reinstall the app, or take a major system upgrade, and
the step re-arms itself. macOS resets grants often enough that an old
acknowledgement would be a lie.

## Your own steps

The checklist is yours to extend, with the same machinery:

```luau
niwa.manual { "Sign in to Tailscale", open = "https://login.tailscale.com" }
niwa.manual { "Restore the seal key", command = "niwa seal-key restore" }
```

`open` is an address the row opens for you, a link or a settings pane.
`command` is shown so you can paste it, and niwa never runs it. That is the
whole difference between a checklist and a script, and it is why a step can
name a command that would be wrong to run unattended.

A step's identity is its text. Reword one and it re-arms, which is what you
want when the instructions themselves changed.

With these, the config stops describing only what niwa can do and starts
describing the machine, including the parts that are yours. A new Mac's
checklist is complete because you wrote the missing half of it.

## Ticking is a person's act

Ticking a step off happens on the dashboard, the screen plain `niwa` prints.

```screen
fixture: the_dashboard_screen_answers_in_one_look
command: niwa
```

When a step is open, the dashboard adds a line naming it. On a terminal the
dashboard also prints the keys it accepts, and a `[t]ick` key joins them. The
screen above was captured through a pipe, where the keys drop away and the
summary stays.

The dashboard is otherwise a view over the same twenty verbs and never a
separate power. Ticking is the one exception, and the reason is the point of
this whole page: a tick is a person saying they did their part. A verb for it
would let a script say it for them, which is exactly the lie the checklist
exists to avoid. niwa never guesses that a human did the work.

The cost is stated rather than hidden: a machine nobody visits keeps its steps
open. That is the correct answer. An open step is not a failure, and it never
blocks anything else.

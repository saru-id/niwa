---
title: Concepts
description: What these pages are for, and the order to read them in.
next:
  - href: /concepts/model
    label: Declared, actual, acknowledged
    why: every other page reads from the three states, so it comes first
---

A concept page explains why niwa behaves the way it does. It states a rule
once, with the reason behind it, so every other page can be short. The
reference pages give flags, exit codes, and signatures. The guides walk one
task at a time. Neither of them argues. These pages do.

Nothing here is a procedure. There are almost no commands on these pages, and
the few that appear are named rather than demonstrated. If you came to run
something, read a guide instead.

Read them in the order below the first time. The model comes first because
every page after it is a consequence of the model. After that, each page
stands on its own.

## The eleven pages

- [Declared, actual, acknowledged](/concepts/model) — the three states every
  resource has, the comparisons they produce, and why a machine is not corrupt
  because a person changed something.
- [The apply loop](/concepts/apply) — the three phases of a run, the two
  passes of your script, and what a failure leaves behind.
- [The checklist and manual steps](/concepts/checklist) — why work that needs
  a person becomes a checklist item and never a prompt.
- [Drift and the write-back loop](/concepts/drift) — how niwa proposes config
  edits, the four answers to a proposal, and why `pull` is apply's inverse.
- [The watcher](/concepts/watcher) — the launchd job that notices things, and
  the one thing it is allowed to do about them.
- [Safety and undo](/concepts/safety) — the archive rule, the journal behind
  `undo`, and why there is no rollback of the whole machine.
- [Secrets](/concepts/secrets) — typed opaque secrets, where they resolve
  from, and what a diff shows in place of a value.
- [Many machines](/concepts/machines) — the git boundary, the per-machine
  stamp, and the lockfile that makes the second machine match the first.
- [The config and its modules](/concepts/config) — structure from the file
  layout, modules as groups, and host files as the override.
- [The config language](/concepts/luau) — why the config is a program, what
  the sandbox buys, and where the types are enforced.
- [What niwa will not do](/concepts/limits) — the refusals, and the limits
  niwa states rather than hides.

## How to read a rule here

Every rule on these pages is derived from something. Where a rule falls out of
the model, the page says so and points at the model. Where a rule is a
decision instead, the page gives the reason for the decision, and the reason is
the part worth remembering.

Where niwa refuses to do something, that refusal is the design and not a gap.
Those are collected on one page, so you can read the whole boundary in one
sitting.

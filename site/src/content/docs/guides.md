---
title: Guides
description: One task per page. Each guide names when to use it and what must already be true, then shows the declarations that do the work.
---

A guide is a task. It opens with when to reach for it and what must
already be true on the machine, and only then shows code. Every Luau
excerpt on these pages type checks against the types niwa installs, so a
block pastes into a module and keeps working.

That order is deliberate. When the second section names something this
machine does not have, you know before you have pasted anything.

Concepts explain why niwa behaves as it does. Reference states every
flag and every signature. Guides sit between the two: enough to finish
the job, and a link to the page that explains the rest.

## The ten guides

- [Manage system settings](/guides/system-settings) — declare a
  preference domain, the Dock, and the Finder, and know what restarts.
- [Manage dotfiles](/guides/dotfiles) — copy a file, link a directory,
  render a template, and choose between the three.
- [Manage packages](/guides/packages) — install formulae, casks, global
  npm packages, mise tools, and release binaries.
- [Manage services](/guides/services) — declare a launchd agent with
  exactly one schedule, and start a Homebrew service.
- [Write a custom resource](/guides/custom-resource) — define a kind of
  your own, with check, apply, reverse, and describe.
- [Share a module](/guides/share-modules) — publish a module, pull one
  in with `niwa.use`, and read its entry in the lockfile.
- [Schedule convergence](/guides/schedule-convergence) — run
  `apply --yes` on a schedule, and decide whether you want that.
- [Recover a machine](/guides/recover) — restore the sealing key, apply,
  and verify what came back.
- [Store and use a secret](/guides/secrets) — add a secret, reference
  it, render it into a file, and escrow the key.
- [Capture a change you made by hand](/guides/capture-a-change) — flip a
  setting in System Settings and keep it.

## When a guide is not what you came for

Three other places answer three other questions.

- [Install](/start) walks the first hour: the binary, the first config,
  the first apply, and a machine you already use.
- [Concepts](/concepts) explains the model the guides assume. The
  shortest useful one is
  [declared, actual, acknowledged](/concepts/model).
- [Reference](/reference) is exhaustive. Every verb, every flag, every
  call in the Luau API, and where each file lives.

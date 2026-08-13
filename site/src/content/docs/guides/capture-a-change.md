---
title: Capture a change you made by hand
description: Flip something in System Settings or install something directly, then read the line niwa offers and decide where it lands.
next:
  - href: /concepts/drift
    label: Drift and the write-back loop
    why: it explains why proposals run in this direction, and what the four answers mean elsewhere
---

## When to use this

Use this when the machine is already right and the config has not caught
up: you flipped a setting in System Settings, or ran an install because
it was faster than opening an editor. Nobody hand-writes two hundred
settings, so niwa proposes the line and you curate it.

## What must already be true

- The config repo is not mid-merge. niwa refuses to edit a config it
  cannot read one side of.
- A terminal is attached. The walk asks questions.

## niwa notices

The watcher is a launchd job with no state and no protocol. It sees that
preferences or the config repo changed, waits five seconds so a burst is
one event, and runs `niwa check --notify`. It notifies. It never applies.

What counts as interesting is a filter, not a guess. niwa watches a short
list of System Settings domains, plus whatever your config touches. A key
it has never seen is learned quietly; only a change to a known key
becomes a proposal. Drift is computed per governed identity, so an app
that rewrites its whole preference file on every launch, while the one
key you govern sits untouched, is silence.

You can ask at any time with `niwa check`. Six things come out of a
survey: a governed file whose bytes moved, a governed rendered file, a
governed preference whose value moved, an ungoverned key in a watched
domain, a package with an install receipt and no declaration, and a
declaration that vanished while its work is still on the machine.

## The walk

```shell
niwa pull
```

`pull` is apply's inverse: machine to config. It shows one difference at a
time and offers four answers, which mean the same thing everywhere.

- **apply** accepts the edit into the config.
- **edit** opens the proposed lines in `$EDITOR` first. What you save is
  what lands.
- **never** is the permanent no. It is remembered per machine in the
  journal's declined list, keyed to the exact proposal with its value, so
  the same key at a different value asks again.
- **skip** is not now. It returns the next time the difference is seen.

The line you are shown is the line that lands.

```luau
niwa.defaults("com.apple.WindowManager", {
  StandardHideWidgets = true,
})
```

This is also how you learn the keys. Nobody knows that hiding desktop
widgets is `StandardHideWidgets` in `com.apple.WindowManager`, and no list
of preference keys survives a macOS release. Flip it, read the line.

## Where the line lands

Packages are matched by provider, preferences by domain. A proposal goes
to the one module that already declares that kind: a formula joins the
module your formulae live in, a `com.apple.dock` key joins the module that
already governs `com.apple.dock`.

Anything that matches nowhere, or matches more than one module, lands in
`modules/inbox.luau`. niwa creates it on first use and adds the require
to `init.luau` so it loads. The inbox is a permanent home, not a queue:
unsorted and working beats blocked on tidying.

When the key is already declared, the proposal edits that declaration in
place instead of appending a second opinion, so the config never holds
two answers about one key. If the existing line cannot be edited with
confidence, niwa names it and leaves it to you. `niwa add` places its
lines by exactly these rules, and `niwa fmt` normalizes them, so a line
niwa wrote reads like one you wrote.

## Everything at once

```shell
niwa pull --all
```

This stages every finding without the walk and leaves the review to git.

```screen
fixture: the_pull_screen_stages_an_unmanaged_package
command: niwa pull --all
```

`pull` writes to the working tree and stops there. Staging and committing
are yours, which is what makes `git diff` the review step.

One finding is never staged by `--all`: a removal. A declaration you
deleted leaves work behind on the machine, and taking that work back
changes the machine rather than the config, so it waits for an
interactive yes. The secret gate runs on every pull, so a line that reads
like a credential is named and held back while the rest goes through.

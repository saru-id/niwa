---
title: Drift and the write-back loop
description: niwa proposes edits to your config and you curate them. That inversion is what makes a config of two hundred settings possible to write.
next:
  - href: /concepts/watcher
    label: The watcher
    why: it is the thing that notices a change and offers the loop
  - href: /reference/cli/pull
    label: pull
    why: the verb that runs this loop, with its flag and exit codes
---

Nobody is going to hand-write two hundred settings. So niwa inverts the
direction of authorship: **niwa proposes edits to your config, and you curate
them.** You flip something in System Settings, and niwa offers you the config
line that would declare it.

That is also the discovery story, and it is worth naming. Nobody knows that
hiding desktop widgets is `com.apple.WindowManager StandardHideWidgets`, and no
catalog of preference keys survives a macOS release intact. With write-back you
need neither. Flip the setting, read the line niwa hands back. The machine
documents its own keys, and the documentation is current because the machine
just produced it.

## The four answers

A proposal is a decision, and the same four answers mean the same thing
everywhere one appears.

| Answer | What it does |
| --- | --- |
| apply | Accept the edit into the config, and make it so. |
| edit | Open the proposed lines in your editor first. What you save is what lands. |
| never | The permanent no. Remembered per machine, and this exact proposal is not made again. |
| skip | Not now. It comes back the next time the difference is noticed. |

Never is remembered in the journal's declined list, keyed on the exact
proposal, value included. A different value asks again, because it is a
different question.

## Where an accepted edit lands

An accepted edit goes to the module where similar declarations already live,
matched by provider for packages and by domain for preferences. Anything that
matches nothing, or matches more than one place, lands in
`modules/inbox.luau`. An ambiguous match is an inbox match, never a guess.

The inbox is a permanent home, not a backlog you are expected to clear.
Unsorted and working beats blocked on tidying. `niwa add` places its lines with
exactly the same logic, so there is one placement rule to learn, not two.

When the key is already declared somewhere, the proposal edits that declaration
in place instead of appending a second one. Flip a Dock setting that
`desktop.luau` already governs and the change lands on the line that already
owns the value. The config never accumulates two opinions about one key, and
the conflict lint never fires against lines niwa itself wrote.

This is also why `niwa fmt` exists. Since the tool writes to your config,
machine-written lines have to be indistinguishable from yours.

## pull is apply's inverse

| Verb | Direction |
| --- | --- |
| `apply` | config to machine |
| `pull` | machine to config |

Plain `pull` walks each difference with the four answers, one decision at a
time. `pull --all` stages everything and leaves the review to `git diff`.

```screen
fixture: the_pull_screen_stages_an_unmanaged_package
command: niwa pull --all
```

A formula installed by hand has a receipt and no declaration, so it becomes a
line. No module in that config declares packages yet, so the line goes to the
inbox, and the last row says what to read next. `pull` writes to the working
tree and stops there. Staging and committing stay yours.

Every axis behaves the same way inside the loop. Files, preferences, and
packages all drift, all propose, and all land in the repo. The dashboard's
review key and the watcher's notification both end in this same walk, so there
is exactly one loop to learn.

## One asymmetry: rendered files are one way

Files are copied rather than symlinked, because symlinks break sandboxed
applications and editors that save by writing a new file. So a live edit needs
a way home, and `pull` is it:

```luau
niwa.file("~/.zshrc", { source = "@self/files/zshrc" })
```

A file produced from a template is different. Live bytes cannot be mapped back
to the inputs that produced them, so `pull` refuses that file by name and
points at the template instead:

```luau
niwa.file("~/.gitconfig", {
  content = niwa.render("[user]\n  email = {email}\n", { email = "you@example.com" }),
})
```

Drift on a rendered file still shows as a difference. The fix is the template,
not a pull. Only files declared with `source` make the round trip, and niwa
says which kind it is looking at rather than leaving you to find out.

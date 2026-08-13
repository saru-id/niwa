---
title: Manage dotfiles
description: Copy a file, link a directory you develop in, render a template with a secret, and know which of the three a file wants.
next:
  - href: /guides/packages
    label: Manage packages
    why: the tools your dotfiles configure come from the package calls
  - href: /reference/api/files
    label: Files and links
    why: both calls in full, with every option
---

## When to use this

Use this guide when a file on the machine should come from your config
repo: a shell config, an editor directory, a credentials file with a
secret in it. Three calls cover all of it, and the difference between
them is who owns the bytes.

## What must already be true

- The source lives in the config repo and is named as a `@self/` path.
  A source outside the repo is refused when the config loads.
- The target starts with `~/` or is an absolute path.
- niwa owns whole files. Half a file is not a unit here.

## Copy a file

```luau
niwa.file("~/.zshrc", { source = "@self/files/zshrc" })
niwa.file("~/.config/ghostty/config", { source = "@self/files/ghostty.conf" })
```

niwa copies; it never links. That is what makes an edit on the machine
yours to keep: `niwa pull` offers the live bytes back to the repo
instead of overwriting them.

`mode` is a string of octal digits, `mode = "600"`. A number is refused
by name, because Luau has no octal literal and a decimal there would set
the wrong bits.

A directory source fans out to one resource per file inside it, each
with its own identity, so drift, pull, and undo stay per file.

```luau
niwa.file("~/.local/bin/", { source = "@self/files/bin/" })
```

## The overwrite rule

One rule governs every write. If the bytes on the machine are the bytes
niwa last wrote, apply replaces them freely. If they are bytes niwa
never wrote, apply leaves them and names the file as protected.

Two ways forward. `niwa pull` brings the live bytes into the repo, or
`apply --force <target>` lifts the protection for that one target.
Either way the replaced bytes are archived first, so `undo` can put them
back. `plan --diff` shows the diff before you choose.

## Link a directory

```luau
niwa.link("~/.config/nvim", { to = "@self/files/nvim" })
```

Reach for `link` when you work inside the directory itself: with a link,
the repo is the live copy. `to` is a `@self/` path, like a source. A
symlink pointing somewhere else is replaced freely, and a plain file in
the way follows the overwrite rule above.

## Render a template

```luau
local token = niwa.secret("github-token")

niwa.file("~/.netrc", {
  content = niwa.render("machine api.github.com login {user} password {token}",
    { user = "stefan", token = token }),
  mode = "600",
})
```

`niwa.render` fills `{name}` placeholders and knows which values are
secret. Secrets resolve at apply time, never at plan time and never into
the repo, so the plan, the log, and the journal all show a mask.

A rendered file is one way. `pull` refuses it by name: live bytes cannot
be mapped back onto a template, so the fix for a rendered file is the
template.

## Which of the three

| The situation | The call | Why |
| --- | --- | --- |
| You edit it on the machine sometimes | `niwa.file` with `source` | the copy is yours, and `pull` brings edits home |
| You develop inside the directory | `niwa.link` | the repo is the live copy, with no round trip |
| It is built from values or holds a secret | `niwa.file` with `content` | the template owns it, and secrets stay masked |

## Two files nobody owns

Whole file ownership is the law for `niwa.file`, and two system files
cannot follow it, because everything on the machine shares them.
`/etc/hosts` takes per-entry declarations through `niwa.hosts`, and the
`/etc/shells` entry plus `chsh` travel together as `niwa.login_shell`.
[System settings](/reference/api/settings) states what each of them does
in this build.

That list is complete. There is no primitive that edits one line of a
file. The moment one exists, every file is partly owned and `pull` stops
meaning anything. If you want a managed line in `.zshrc`, own `.zshrc`.

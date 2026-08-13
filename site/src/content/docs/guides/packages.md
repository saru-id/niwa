---
title: Manage packages
description: Install formulae, casks, App Store apps, global npm packages, mise tools, and release binaries, and know when the batch runs.
next:
  - href: /guides/services
    label: Manage services
    why: a daemon is a package plus a schedule
  - href: /reference/api/packages
    label: Packages and tools
    why: the seven calls in full, with every shape they accept
---

## When to use this

Use this guide when software should be present on the machine: command
line tools, applications, npm packages, toolchains, a binary from a
release page. Seven calls cover them, one per source.

## What must already be true

- niwa drives the installer you declare against, so the machine needs
  that command. `niwa.command("mise")` answers whether it is there.
- A release binary must be pinned before apply installs it. `niwa
  update` writes the version and its hash into the committed `niwa.lock`.

## Homebrew formulae and casks

```luau
niwa.brew.formula { "fd", "ripgrep", "jq", "fzf" }
niwa.brew.cask { "ghostty", "raycast", "orbstack" }
niwa.brew.formula "owner/tap/tool"
```

Three shapes. One name returns one result, a list returns a list of
results in the same order, and a table with a `name` field carries
options. A tap-qualified name is written in full; the receipt lives
under the tool's own name, so niwa checks the tail. Those receipts under
the Homebrew prefix are what niwa reads, rather than asking brew what is
installed, so checking a hundred formulae is a hundred directory reads.

## App Store apps

```luau
niwa.mas.app { ["Things 3"] = 904280696 }
```

Keys are names for people, values are the numeric ids, and the id is the
identity. This build declares and counts App Store apps; it does not
check whether they are installed. Signing in is work for a person, so it
belongs on the checklist with `niwa.manual`, not inside an apply.

## npm packages and mise tools

```luau
niwa.npm.global { "@biomejs/biome" }
niwa.mise.tool { node = "lts", rust = "stable" }
```

`npm.global` takes the same three shapes as the Homebrew calls. For
mise, keys are tools and values are version strings. What a version
string resolved to pins in `niwa.lock`, so the second machine installs
your version rather than whatever the string means the day it runs.

## Release binaries

```luau
niwa.github_release { repo = "jesseduffield/lazygit", bin = "lazygit" }
```

`repo` is `owner/name`. `bin` is a bare file name, needed when the
binary is not called after the repository, and it lands in
`~/.local/bin`. The version and its sha256 pin in `niwa.lock`: install
downloads the asset, hashes it, and refuses anything else.

Apply then records two facts: the digest of the binary it installed, and
the pin it came from. A later plan reads both back. Same pin and same
bytes is in sync. The same pin with different bytes means a person
replaced the binary. apply protects it until `apply --force <target>`
says otherwise, and force archives what it replaces first. A different
pin means the lockfile moved, and the new version is pending.

## When a package may fail

```luau
niwa.brew.formula { name = "btop", optional = true }
```

An optional package that fails records `failed = true` on its result and
the run continues. `optional` is accepted on the package calls and on
`niwa.run`, and nowhere else.

## Twelve formulae, one install

Declarations of the same kind coalesce, so twelve formulae in a module
become one `brew install` at apply. A different kind arriving cuts the
batch first, which keeps effects in the order the config states them.
Reading any field of any pending result flushes the batch before it
answers: that read is the barrier, and it is why a branch on `.changed`
can be trusted.

`plan` does not batch. It settles each declaration alone and prints one
line each:

```screen
fixture: plan_mixed_pending_color
command: niwa plan
```

The closing line is the honest part: after the first pending change, a
result is a prediction until apply settles it.

---
title: File locations
description: Every file niwa reads or writes, where it lives, and whether it is committed. Four roots hold all of it.
next:
  - href: /reference/formats
    label: File formats
    why: it gives the exact shape of the lockfile, the journal and the stamp
  - href: /reference/environment
    label: Environment variables
    why: five of them move the roots this page names
  - href: /reference/cli/init
    label: init
    why: it is the verb that writes most of what is listed here
---

Four roots hold everything: the config repo, the state directory, shared data,
and a few places elsewhere on the machine. One module resolves all of them, so
nothing else in the tool reads `HOME` or the XDG variables.

## The config repo

Everything here is committed. The repo is an ordinary git repository, and
`niwa init` runs `git init` in it.

```tree
label: ~/.config/niwa
init.luau — the entry point: requires each module, then calls niwa.host()
.luaurc — strict mode, and the @niwa and @self aliases
niwa.lock — the resolved versions, committed on purpose
modules/cli.luau
modules/apps.luau
modules/shell.luau
modules/dev.luau
modules/desktop.luau
modules/system.luau
modules/services.luau
modules/inbox.luau — where an ambiguous proposal lands, permanently
hosts/<machine>.luau — this machine only, loaded last
files/ — sources for niwa.file and niwa.link, named @self/files/…
secrets/<name>.age — one sealed secret per file
secrets/seal-key.age — the passphrase-protected key escrow
state/<machine>.toml — one stamp per machine, written after every apply
```

The secrets are committed because they are ciphertext. The key that opens them
is not in the repo: it lives in the state directory, and `niwa seal-key backup`
escrows a passphrase-protected copy at `secrets/seal-key.age`.

`state/` is the only directory niwa writes into the repo by itself. Stamps
dirty the tree after every apply by design, so the dirtiness check that guards
`apply --yes` excludes them.

## The state directory

None of this is committed, and none of it crosses to another machine.

```tree
label: ~/.local/state/niwa
journal.json — acknowledgements, the apply entries, and the declined list
archive/<identity>/<sha256> — displaced bytes, one file per distinct content
apply.lock — the exclusive lock: one apply at a time
seal.key — this machine's sealing key
machine-id — the fallback identifier, when the hardware will not give one
tags — this machine's tags, written by niwa tag
baseline.json — the drift baseline the watcher's survey learns from
digest.json — the weekly upstream digest
cache/<sha256> — prefetched release downloads
run.log — the full output of the commands niwa runs
```

The journal stays local because the archives beside it hold your bytes.
Archives are pruned past ninety days. `niwa uninstall` leaves this directory
alone unless you add `--purge`.

Every verb that writes takes `apply.lock`: `apply`, `undo`, `pull`, `add`,
`update` and `uninstall`. A plain `check` takes it when it can, so it cannot
save a snapshot over a running apply. `plan` never takes it, and neither does
the watcher's `check --notify`, so a survey can never block an apply.

## Shared data

```tree
label: ~/.local/share
niwa/types/init.luau — the type definitions your editor reads
niwa/modules/<sha256>/ — shared modules resolved by niwa.use
mise/installs/ — where mise puts the toolchains you declare
```

`niwa init` writes the types and `niwa uninstall` removes them. A shared module
is stored under the hash the lockfile pins, so two machines resolving the same
`niwa.use` line read the same bytes.

## Elsewhere on the machine

| Path | What is there |
| --- | --- |
| `~/.local/bin/niwa` | the binary, where the installer puts it |
| `$ZDOTDIR/.zshrc`, or `~/.zshrc` | one PATH line, carrying the comment that lets `uninstall` remove exactly it |
| `~/Library/LaunchAgents/rs.niwa.watcher.plist` | the watcher's launchd job |
| `~/Library/LaunchAgents/<label>.plist` | one plist per `niwa.service`, named after its label |
| `~/Library/LaunchAgents/homebrew.mxcl.<name>.plist` | read to check a `niwa.brew.service` |
| `~/Library/Preferences/` | user preference domains, and one of the watcher's two watch paths |
| `/Library/Preferences/` | the only place an absolute `defaults` domain may live |
| `/Library/Managed Preferences/` | read to find the keys an organization already governs |

## Where the roots come from

| Root | Default | Moved by |
| --- | --- | --- |
| home | — | `HOME`, which must be set and absolute or niwa stops |
| the config repo | `~/.config/niwa` | `XDG_CONFIG_HOME` |
| the state directory | `~/.local/state/niwa` | `XDG_STATE_HOME` |
| shared data | `~/.local/share` | `XDG_DATA_HOME` |
| the Homebrew prefix | `/opt/homebrew` on Apple silicon, `/usr/local` otherwise | `HOMEBREW_PREFIX` |

An XDG variable is honored when it is set to an absolute path, and ignored
otherwise. Each one replaces only the leading half: `XDG_STATE_HOME=/tmp/x`
puts the journal at `/tmp/x/niwa/journal.json`.

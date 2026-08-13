---
title: Install
description: One command puts the niwa binary on the machine, and this page says exactly what it touched.
next:
  - href: /start/first-config
    label: Your first config
    why: the binary does nothing until a config describes the machine
---

## The one-liner

```shell
curl -fsSL niwa.rs | sh
```

That installs the binary and stops. When it finishes, open a new shell and run
`niwa init`.

## With a config repo

When your config already lives in a git repository, name it:

```shell
curl -fsSL niwa.rs | sh -s -- --config github:you/dotfiles
```

`github:owner/repo` clones from GitHub. Add `@ref` for a branch, a tag, or a
commit: `github:you/dotfiles@v2`. Anything else reaches git as written, so an
https URL, an ssh URL, or a path all work. The clone lands at `~/.config/niwa`.
When a config already sits there, the installer leaves it alone.

The installer takes no other argument. It accepts nothing at all, or
`--config <repo>`, and it checks that before it fetches anything, so a
misspelling costs nothing.

## What it does, in order

1. Refuses to run anywhere but macOS.
2. Installs the Command Line Tools when `xcode-select` finds none. macOS asks,
   the installer waits, and it continues the moment they are in. After an hour
   of waiting it stops and tells you to run it again once they are in.
3. Fetches `niwa-0.1.0-macos-<arch>.tar.gz` and the `.sha256` beside it from
   `https://niwa.rs/release`.
4. Checks the checksum. A mismatch ends the run and nothing is installed.
5. Unpacks one binary to `~/.local/bin/niwa`.
6. Wires PATH once.
7. Clones your config, when you named one.
8. Walks on, or prints the next steps.

Run it again and it replaces the binary and changes nothing else.

## What it touched

| Path | What lands there |
| --- | --- |
| `~/.local/bin/niwa` | one binary, and nothing beside it |
| `~/.zshrc` | one PATH line, marked `# added by niwa` |
| `~/.config/niwa` | the cloned config, with `--config` only |

The line is `export PATH="$HOME/.local/bin:$PATH"`, and the marker comment is
the guard: a second run finds the marker and writes nothing. `ZDOTDIR` moves
which `.zshrc` gets it.

`niwa uninstall` removes the watcher, the shipped types, that PATH line, and
the binary. It keeps the config repo, and it leaves the machine niwa configured
as it stands.

## The walk

With a config in place and a terminal behind the pipe, the installer keeps
going.

- `niwa seal-key restore`, when the repo holds `secrets/seal-key.age`. It asks
  for the escrow passphrase once.
- `niwa apply`. It shows the plan, prints the checklist at the top, and asks
  once before it changes anything.

With no terminal, it prints these three steps and stops:

```shell
niwa seal-key restore
niwa plan
niwa apply
```

## Two variables

`NIWA_RELEASE_BASE` moves where releases are fetched from, for a mirror or a
test. `NIWA_VERSION` pins a version in place of the default.

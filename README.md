<p align="center">
  <img src=".github/assets/niwa-mark.png" width="112" alt="A niwa seedling growing from a small bed of soil">
</p>

<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/niwa-wordmark-cream.svg">
    <source media="(prefers-color-scheme: light)" srcset=".github/assets/niwa-wordmark-ink.svg">
    <img src=".github/assets/niwa-wordmark-ink.svg" width="260" alt="niwa">
  </picture>
</h1>

<p align="center">Your whole Mac, configured by one script you can actually read.</p>

<p align="center">
  <a href="https://niwa.rs/start">Install</a> ·
  <a href="https://niwa.rs/concepts">Concepts</a> ·
  <a href="https://niwa.rs/reference">Reference</a> ·
  <a href="https://github.com/saru-id/niwa/releases">Releases</a>
</p>

niwa is a configuration tool for macOS. A strict Luau program declares your packages, dotfiles, settings, services, and manual steps. niwa compares that declaration with the machine, prints the plan, and asks before changing anything.

> [!WARNING]
> niwa is under active construction and is not ready for regular use.

## Install niwa

The installer verifies the release checksum, puts one binary in `~/.local/bin`, and wires your `PATH` once:

```shell
curl -fsSL niwa.rs | sh
```

Run `niwa init` in a new shell. It creates a typed starter config from the current machine. Read [what the installer touches](https://niwa.rs/start) before running it.

## Describe your Mac

Your config is a program, so declarations can share values and react to prior results. The shipped Luau types catch invalid calls in your editor and during `niwa check`.

```luau
--!strict
local niwa = require("@niwa")

niwa.brew.formula { "fd", "ripgrep", "jq" }

niwa.dock {
  autohide = true,
  tilesize = 48,
}

niwa.file("~/.zshrc", { source = "@self/files/zshrc" })

local nvim = niwa.brew.formula "neovim"
local cfg = niwa.link("~/.config/nvim", { to = "@self/files/nvim" })
if nvim.changed or cfg.changed then
  niwa.run("nvim --headless '+Lazy! sync' +qa", { timeout = "5m" })
end
```

`niwa plan` explains the difference without changing the machine. This output comes from the repository test suite:

```text
[init]
brew.formula:fd
brew.formula:ripgrep
brew.formula:jq
com.apple.dock autohide                 false → true
~/.zshrc
brew.formula:neovim
~/.config/nvim
run:nvim --headless '+Lazy! sync' +qa
9 checked · 8 would change
results read past the first change are predictions until apply
```

## Use the daily loop

Six commands cover the normal loop:

| Command | What it does |
| --- | --- |
| `niwa` | Shows the machine dashboard |
| `niwa check` | Validates the config without reading machine state |
| `niwa plan` | Shows what an apply would change |
| `niwa apply` | Prints the plan, asks once, then executes it |
| `niwa pull` | Proposes config edits for changes made on the machine |
| `niwa undo` | Reverses the most recent apply |

The [command reference](https://niwa.rs/reference) documents all twenty verbs, their flags, and their exit codes.

## Declare the whole machine

niwa models each thing as a named resource:

| Surface | What you can declare |
| --- | --- |
| Packages | Homebrew formulae, casks, services, App Store apps, global npm packages, mise tools, and GitHub release binaries |
| Files | Copied files, directory trees, rendered templates, and symbolic links |
| macOS | Preference domains, Dock and Finder settings, hosts, the hostname, and the login shell |
| Services | Launch agents, guarded commands, and one-time bodies |
| Human work | Permissions and manual checklist steps that niwa names but never performs |
| Secrets | Keychain values, sealed repository files, and external secret managers |

Define a custom resource when the built-in surface stops short. Its check phase receives a read-only handle, so a plan cannot change the machine.

## Keep every change accountable

niwa tracks three states for each resource: what you declared, what the machine reports, and what the last apply acknowledged. That model makes drift visible without treating every manual edit as damage.

- `apply` never runs without a plan and confirmation unless you pass `--yes`
- Files with unacknowledged edits stay protected until you pull or force them
- Existing bytes enter the local archive before niwa overwrites them
- `undo` reverses one apply and records any irreversible step plainly
- The watcher can notify you, but it cannot apply on its own
- Secret values stay opaque during planning and never appear in output

Read [the state model](https://niwa.rs/concepts/model), [safety and undo](https://niwa.rs/concepts/safety), and [the explicit limits](https://niwa.rs/concepts/limits) for the complete contract.

## Develop niwa

The Rust CLI, its acceptance drills, and the documentation site live in this repository. Run the required gates before sending a change:

```shell
make check
make verify
make site-check
```

`make check` formats, lints, tests, and audits dependencies. `make verify` adds the full drill suite and coverage report. `make site-check` validates and builds the documentation site.

## License

niwa is available under either the [MIT License](LICENSE-MIT) or the [Apache License 2.0](LICENSE-APACHE), at your option.

---
title: The Luau API
description: One table, three layers, one result type. This page states the shape of the API; the seven pages it routes to state every call in it.
next:
  - href: /reference/api/packages
    label: Packages and tools
    why: seven calls install software, and most configs start there
  - href: /reference/api/functions
    label: Luau utilities
    why: it holds niwa.resource, the way past the nineteen built-in kinds
  - href: /reference/formats
    label: File formats
    why: it gives the exact shape of the .luaurc described here
---

Your config is a Luau program. `require("@niwa")` returns one frozen table, and
every effect on the machine is a call on it. There is no `io`, no `os.execute`,
and no raw filesystem.

## Three layers

Reach for them in this order. **Typed sugar**, for the things everyone touches.
It autocompletes and knows which process to restart.

```luau
niwa.brew.formula { "fd", "ripgrep", "jq" }
niwa.npm.global { "@biomejs/biome" }
niwa.finder { show_hidden = true, default_view = "list" }
```

**The generic resource**, for anything the sugar does not cover, which on macOS
is anything `defaults` can say.

```luau
niwa.defaults("com.apple.WindowManager", {
  StandardHideWidgets = true,
  EnableStandardClickToShowDesktop = false,
}, { restart = "Dock" })
```

**The escape hatch**, which is the only way to run a command.

```luau
niwa.run("nvim --headless '+Lazy! sync' +qa", {
  unless = niwa.exists("~/.local/share/nvim/lazy"),
  timeout = "5m",
})
```

A command needs a guard, because an unguarded command is the one thing that can
never be idempotent. `unless`, `only_if` and `creates` each satisfy it, and
inside `niwa.once` the marker is the guard. Guards are read only, so they run
during `plan` too. A command needing administrator rights says
`privileged = true`, which lists it with the privileged steps and lets
`--no-privileged` skip it whole.

## Results and `changed`

Every resource call returns a frozen `Result`. Branching is plain Luau. Program
order is the order.

```luau
local nvim = niwa.brew.formula("neovim")
local config = niwa.link("~/.config/nvim", { to = "@self/files/nvim" })

if nvim.changed or config.changed then
  niwa.run("nvim --headless '+Lazy! sync' +qa", { timeout = "5m" })
end
```

Two rules make that coexist with batching. **Reading a result is a barrier**:
package declarations of one kind coalesce into a single invocation, and reading
any field of any pending result flushes the batch first, so `nvim.changed` is
the truth and never a guess. **Reading a result also arms the run's guard
context**: after the first read, a `niwa.run` with no `unless`, `only_if` or
`creates` is accepted, because the branch around it is the guard. Prediction
gets less certain past the first change, and `plan` says so in a note.

## The exported types

| Type | What it is |
| --- | --- |
| `Result` | What every resource call returns: `changed`, `present`, `version` and `failed`. Frozen. `failed` is only ever true under `optional`. |
| `Plist` | Everything a preference plist can say: boolean, number, string, list, or string-keyed map, recursively. |
| `Secret` | An opaque handle from `niwa.secret`. It resolves at apply time, never at plan time, and never into the config. |
| `Rendered` | An opaque template from `niwa.render`, for `content =`. The plan shows its shape and masks the secrets in it. |
| `ReadHandle` | The handle a custom resource's `check` receives. Its `exec` returns `stdout` and `code`. |
| `ActHandle` | The handle `apply` and `reverse` receive. Its `exec` returns nothing. |

A seventh export, `Niwa`, is the type of the table `require("@niwa")` returns.
Two more shapes carry the call overloads. They are internal to the type file, so
you name neither. The first three forms below cover `brew.formula`, `brew.cask`
and `npm.global`; the last covers `brew.service`.

| Form | Gives |
| --- | --- |
| `niwa.brew.formula("jq")` | one `Result` |
| `niwa.brew.formula { "fd", "ripgrep" }` | one `Result` per name, in a list |
| `niwa.brew.formula { name = "pandoc", optional = true }` | one `Result`, and a failure sets `failed` instead of stopping the run |
| `niwa.brew.service { "postgresql@16", "redis" }` | one `Result` for the whole list |

## How the types reach your editor

`niwa init` writes the type definitions to `~/.local/share/niwa/types/init.luau`
and generates `.luaurc` in the config repo. That file sets `languageMode` to
`strict` and aliases `@niwa` to the types directory and `@self` to the repo.
`luau-lsp` reads both, which is where hover docs, autocomplete and type errors
come from. niwa never executes the type file; the real API is in the binary.

Embedding Luau gives niwa the compiler and the runtime, not the analyzer, so
annotations are not enforced by the fact of running. In the editor the shipped
types close that gap. At runtime every resource validates its own spec and
reports which resource, which field, what was expected and what arrived.
`niwa check` runs the full analyzer when `luau-analyze` is present, and says
plainly when it is not.

## The rest of the surface

Twenty resource calls over nineteen named kinds plus custom, eight functions,
seven facts.

| Page | What it holds |
| --- | --- |
| [Packages and tools](/reference/api/packages) | 7 calls: Homebrew formulae, casks and services, the App Store, npm, mise, GitHub releases |
| [Files and links](/reference/api/files) | 2 calls: one copies, one links |
| [System settings](/reference/api/settings) | 6 calls: preference domains, the Dock, the Finder, and three machine-wide settings |
| [Services](/reference/api/services) | 3 calls: a launchd agent, a guarded command, a body that runs once |
| [Manual steps](/reference/api/human) | 2 calls: the work only a person can do |
| [Luau utilities](/reference/api/functions) | 8 functions, including `niwa.resource` |
| [Facts](/reference/api/facts) | 7 values the config can read about this machine |

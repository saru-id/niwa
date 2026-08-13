---
title: Write a custom resource
description: Define a resource kind of your own with check, apply, reverse, and describe, and know what the two handles can do.
next:
  - href: /guides/share-modules
    label: Share a module
    why: a kind other people can use travels as a module
  - href: /reference/api/functions
    label: Luau utilities
    why: niwa.resource beside the rest of the functions
---

## When to use this

The built-in kinds are deliberately few: package, file, link, defaults,
service, exec. Write a kind of your own for everything else — editor
extensions, tools a language installs itself, anything with a command
that lists and a command that installs.

A custom kind earns a plan line, a check on every run, an identity
`explain` can resolve, and a place in the report. `niwa.run` with a
guard does none of that.

## What must already be true

- One command can answer whether the thing is present. `check` turns
  that answer into a boolean.
- The kind name is lowercase words joined by dots, like `dotnet.tool`.
  The nineteen built-in names are reserved, and defining one name twice
  is an error.
- Every declaration carries a `name`. The kind and that name are the
  identity, so `rustup.component:rust-analyzer` is one resource.

## A kind in fifteen lines

```luau
local rustup_component = niwa.resource("rustup.component", {
  check = function(read, spec: { name: string }): boolean
    return read.exec("rustup component list --installed").stdout
      :find(spec.name, 1, true) ~= nil
  end,
  apply = function(act, spec)
    act.exec(`rustup component add {spec.name}`)
  end,
  reverse = function(act, spec)
    act.exec(`rustup component remove {spec.name}`)
  end,
  describe = function(spec)
    return `rustup component {spec.name}`
  end,
})

rustup_component { name = "rust-analyzer" }
```

`niwa.resource` returns a constructor. Calling the constructor declares
a resource and returns a result, so `.changed` branches exactly as it
does for a formula.

`check` runs in both passes. That is what lets `plan` tell the truth
about a kind niwa has never seen: it asks your question and prints what
`describe` returns. `apply` runs only when `check` answered no.

## The two handles

`check` receives the read handle. It is the question half, and it
changes nothing. `apply` and `reverse` receive the acting handle.

Both handles carry one function, `exec`, which runs a command under a
deadline. The read handle's answers are memoised for the run and keyed
by the command line, so ten checks asking one question cost one answer.
The acting handle never caches, because effects have to run. The types
state the split — the read handle returns `{ stdout, code }`, the acting
handle returns nothing — and at this version both run through the same
exec surface, so it is a rule you keep rather than one niwa enforces.

## Kinds that cannot be reversed

`reverse` is part of the contract, not an extra. Give a function, or say
`reverse = false` and the kind is marked irreversible. Leaving the field
out is an error when the kind is defined.

```luau
local vscode_extension = niwa.resource("vscode.extension", {
  check = function(read, spec: { name: string }): boolean
    return read.exec("code --list-extensions").stdout:find(spec.name, 1, true) ~= nil
  end,
  apply = function(act, spec)
    act.exec(`code --install-extension {spec.name}`)
  end,
  reverse = false,
  describe = function(spec)
    return `vscode extension {spec.name}`
  end,
})

vscode_extension { name = "rust-lang.rust-analyzer" }
```

In this build the journal records every custom change as irreversible
and names it, whichever `reverse` you wrote. `undo` says what it will
not take back rather than taking it back quietly.

## Kinds that need administrator rights

A definition that says `privileged = true` marks every resource of the
kind. They are listed with the other privileged steps before the run
starts, and `apply --no-privileged` skips them whole. It is the fifth
and last field a definition may carry, and an unknown field stops the
config while naming itself.

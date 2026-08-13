---
title: Manage system settings
description: Declare preference domains, the Dock, and the Finder, and know which process restarts when a key changes.
next:
  - href: /guides/dotfiles
    label: Manage dotfiles
    why: settings and dotfiles are the same declaration against two stores
  - href: /reference/api/settings
    label: System settings
    why: the six calls, with their full signatures
---

## When to use this

Use this guide when a macOS setting should survive a rebuild, or should
be the same on two machines. niwa reads and writes preference plists
directly, so anything the preference system stores can be declared.

Some settings are not preferences. An application that keeps its state
somewhere else is out of reach here.

## What must already be true

- A config repo exists, written by `niwa init`.
- You know the domain and the key. If you set it by hand first,
  [`niwa pull`](/guides/capture-a-change) offers you the line.
- Domains under `/Library/Preferences` need administrator rights. Apply
  names those steps before it asks you to confirm, and
  `apply --no-privileged` skips them whole.

## Declare a domain

`niwa.defaults` takes a domain, a table of keys, and an optional table
of options.

```luau
niwa.defaults("com.apple.WindowManager", {
  StandardHideWidgets = true,
  EnableStandardClickToShowDesktop = false,
}, { restart = "Dock" })

niwa.defaults("NSGlobalDomain", {
  KeyRepeat = 2,
  InitialKeyRepeat = 15,
  ApplePressAndHoldEnabled = false,
})
```

Each key is its own resource. The first key above has the identity
`defaults:com.apple.WindowManager:StandardHideWidgets`. Two modules can
declare different keys of one domain and never meet. Two modules
declaring the same key with different values is a conflict, and `check`
names both source locations.

## Where the keys land

A bare domain is a reverse-DNS name and lives in
`~/Library/Preferences/<domain>.plist`. `NSGlobalDomain` is the one
exception: it is `.GlobalPreferences.plist` in the same directory.

An absolute domain must start with `/Library/Preferences/`, and niwa
refuses any other absolute path when the config loads. A key that a
configuration profile manages is refused too: the profile is the owner,
and the error names it.

## The Dock and the Finder

Two things people change often have sugar. It lowers to the same
identities as the generic form, so a host file can override one key of
it and conflict detection sees through the spelling.

```luau
niwa.dock {
  autohide = true,
  tilesize = 48,
  apps = {},
  minimize_effect = "scale",
}

niwa.finder {
  show_hidden = true,
  default_view = "list",
  path_in_title = true,
}
```

`apps` accepts the empty list and nothing else in this build: a
populated Dock stores tile dictionaries that this version does not
build. `default_view` takes `list`, `icon`, `column`, or `gallery`, and
niwa writes the four-character code the plist expects.

## What restarts

`restart` names a process to stop once the writes have landed. The Dock
sugar and the Finder sugar name theirs for you. Restarts run at the end
of the pass, one per named process, so five keys that name the Dock
restart it once. A run that wrote any preference invalidates the
preference cache first, so no cached copy can undo the write.

## Read the plan first

```screen
fixture: plan_pending_color
command: niwa plan
```

The line names the key, then the change: the value on the machine, then
the value you declared. Group headers are your modules. `undo` reverses
a preference like any other change: it puts the previous value back, and
removes a key that was not there before.

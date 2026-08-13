---
title: Probe
description: One page that exercises the template end to end, so the parts are proven before the documentation is written on them.
next:
  - href: /
    label: The front page
    why: it states what niwa is, and this page does not
  - href: /llms.txt
    label: The page index
    why: it lists every page this one stands in for
---

Everything the docs template does happens on this page: a grammar, a fence
gate, a table, a screen the tool printed, and headings that anchor. The
documentation replaces it.

## A configuration block

Long brackets carry their level, so a string can contain what looks like a
closing bracket without ending early.

```luau
local step = { type = "formula", name = "ripgrep" }

niwa.brew.formula(step.name)

niwa.file("~/.config/niwa/note.txt", {
  content = [=[
    The kind is ]] and the string keeps going.
  ]=],
  mode = "600",
})

print(step.type)
```

### A command

```shell
niwa apply --dry-run
```

## A screen

The screen below is not written here. It is read at build time from the
snapshot the tool's own tests wrote, and the caption names that file.

```screen
fixture: plan_pending_color
command: niwa plan
```

## A table

| Flag | Meaning |
| --- | --- |
| `--dry-run` | Shows the plan and changes nothing. |
| `--config` | Reads the configuration from another path. |

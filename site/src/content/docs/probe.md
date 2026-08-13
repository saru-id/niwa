---
title: Probe
---

This page proves the rendering pipeline is wired: a grammar, a fence gate, a
table, and headings that anchor. The documentation replaces it.

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

## A table

| Flag | Meaning |
| --- | --- |
| `--dry-run` | Shows the plan and changes nothing. |
| `--config` | Reads the configuration from another path. |

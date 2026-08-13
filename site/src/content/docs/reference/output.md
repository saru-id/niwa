---
title: Output, marks, and errors
description: The mark vocabulary, the color roles, how the same output adapts to where it lands, and the four questions every error answers.
next:
  - href: /reference/cli/plan
    label: plan
    why: it prints the screen this page uses to show adaptivity
  - href: /reference/environment
    label: Environment variables
    why: five of them decide color, hyperlinks, and progress
  - href: /reference
    label: Reference
    why: every verb prints in the vocabulary fixed here
---

The terminal is the whole interface, so it is designed rather than logged. One
vocabulary serves every verb, which means learning one screen is learning them
all.

## The marks

| Mark | Means | Color role |
| --- | --- | --- |
| `✓` | true, done | good |
| `+` | created, added | good |
| `~` | changed | warn |
| `-` | removed, or an offer to remove | bad |
| `✗` | failed | bad |
| `▸` | in progress | accent |
| `→` | waiting on a human | accent |
| `↻` | restarted | muted |
| `↓` | downloading | accent |

`↓` is reserved. Downloads run as background prefetches, so no code path in the
tool prints it today. The row is here because the vocabulary is fixed, not
because you will see it.

## Color is semantics, never decoration

The five roles map onto the terminal's own sixteen colors, so niwa wears your
theme instead of shipping one.

| Role | ANSI |
| --- | --- |
| good | `32` |
| warn | `33` |
| bad | `31` |
| accent | `36` |
| muted | `2` |

Meaning never travels by color alone. The marks differ by shape, which keeps
every screen legible to a colorblind reader, to `grep`, and to a screen reader.
Bold marks identifiers, dim marks metadata, backgrounds are never painted
outside the dashboard's selection, and nothing blinks. Alignment is part of the
language: columns line up across a whole run, so the eye scans a column once
instead of parsing each line.

## The same output, wherever it lands

**Piped or redirected.** Marks, color and progress drop away. A group header
becomes `[name]`, nothing truncates, and what remains is line oriented and
grep friendly. One run, on a terminal and through a pipe:

```screen
fixture: plan_mixed_pending_color
command: niwa plan
```

```screen
fixture: plan_mixed_pending_piped
command: niwa plan
```

**Asked directly.** Three variables are honored as the community defined them,
with no house interpretation.

| Variable | Effect |
| --- | --- |
| `NO_COLOR`, set and not empty | color off; the marks and the layout stay |
| `TERM=dumb` | the same, and no hyperlinks |
| `FORCE_COLOR`, set, not empty, not `0` | color and marks even through a pipe |

**Narrow terminals.** The width comes from `tput cols`, and falls back to 80
columns. When a row will not fit, the identifier truncates from the front and
the tail survives, because the tail is the signal.

**Progress.** On a terminal it is one redrawn line, because the scrollback is
yours and niwa does not fill it with frames. Off a terminal, which is what a
build log is, it becomes one plain line at most every `NIWA_PROGRESS_EVERY`
seconds, and the default is 30.

**Capable terminals.** Every `file:line` becomes an OSC 8 hyperlink on the
terminals known to render them, read from `TERM_PROGRAM`: iTerm.app, WezTerm,
ghostty, kitty, and vscode. Everywhere else the same text stays plain.

## The machine interface

`niwa plan --json` prints one document, and it is the only `--json` in the tool.
The document carries `version`, `resources`, `pending`, `unchecked` and `items`.
Each item carries `identity`, `unit`, `action` and `detail`, where `action` is
`in-sync`, `create`, `change` or `unchecked`, and `detail` is `null` unless the
action is `change`.

`version` is `1`. It is versioned the way the journal is: a change ships with
its migration in the same release. Exit codes are the human screen's, so
`--json` changes what is printed and nothing else: 0 in sync, 2 with changes
pending, 1 on an error.

## Errors have an anatomy

Every error answers four questions, in this order.

1. **What was being done** — the resource, and its source location.
2. **What happened** — the command, the exit code, and the stderr lines that
   carry the signal, with the path of the full log for the rest.
3. **What to do next** — a pasteable command when one honestly exists, and
   nothing when it does not, because an invented suggestion is worse than none.
4. **Where that leaves the machine** — applied and not reached counts, so
   partial is never mistaken for corrupt.

A verb that changes nothing stops at three. `check` has no machine state to
report, so it does not invent one.

A config error earns a compiler-quality frame: the `file:line`, the offending
line quoted beneath it, and the span underlined. Your config is code, and code
deserves better than a line number. A raw stack trace is never the answer to
anything, and `--debug` is the one way to keep one, for a bug report.

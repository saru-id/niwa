---
title: The config language
description: Why the config is a typed script, what the sandbox buys, and where the types are actually enforced.
next:
  - href: /reference/api
    label: The Luau API
    why: the three layers and the exported types, in full
  - href: /concepts/limits
    label: What niwa will not do
    why: several of the refusals fall out of the sandbox
---

The config is a Luau program. It runs top to bottom, and its order is
the order things happen in. That one choice carries the rest of the
tool, so it is worth saying what it buys.

## Why a typed scripting language

Three properties decided it. It has a real type system, so the API can
describe itself: `niwa.finder` takes four views, the editor offers those
four, and a fifth is an error before you save. It is sandboxed by
construction rather than by removal, which is what the next section
rests on. And it is small enough to embed in the tool, so a config error
is a line number in your own file rather than a stack trace from
somewhere else. The cost is real: editor support comes from `luau-lsp`,
and there are fewer examples on the internet to copy from.

Two language features also replaced concepts the API would otherwise
need. String interpolation stands in for a template engine:

```luau
niwa.file("~/.gitconfig", {
  content = `[user]\n\tname = {niwa.machine.owner}\n`,
})
```

And a recursive type alias covers every shape a preference file can
hold, which is what lets `niwa.defaults` accept nested arrays and
dictionaries and still type check.

## Strict mode

The `.luaurc` that `init` writes sets `languageMode` to `strict`, and
every file it writes begins with `--!strict`. Inference is not enough
for a file that changes a machine. A misspelled field should be an error
in your editor, not a refusal three minutes into an apply.

## The sandbox is load bearing

A config cannot open files, spawn processes, or load libraries, and
`loadstring` is removed, because code assembled from strings cannot be
read before it runs. Every effect goes through the API table that
`require("@niwa")` returns, and every table niwa hands out is frozen, so
a config cannot rewrite the API it is calling.

Stated once: a config can only do what niwa can report. Four things
follow.

- The plan is complete. There is no side channel it failed to mention.
- The journal is complete, which is the only kind worth trusting when
  undo reads it back.
- A shared module is inspectable before you run it. `niwa plan` shows
  what it would do while you are still deciding.
- The report is the whole truth about what the run did.

The escape hatch is `niwa.run`, itself a resource: guarded, reported,
timed, and recorded in the journal.

## Runtime limits

The script runs inside niwa's own process, under a memory ceiling of 256
MB and a clock. The pass that reads your config has ten seconds, which
is generous for declarations and hostile to a hang. The pass that
carries out effects has two hours, because installers and downloads
carry their own deadlines.

An accidental endless loop therefore dies in seconds, pointing at the
line, instead of hanging your terminal. The watcher validates the config
on every save, and a validator that hangs would stall each one.

## Where types are actually enforced

An honest embedding detail. The Luau virtual machine gives syntax and
runtime, not the analyzer. Type checking is a separate frontend, so
embedding the language does not enforce your annotations by itself. niwa
covers the gap from three sides.

- **The editor.** niwa ships its type definitions to
  `~/.local/share/niwa/types`, and `.luaurc` aliases `@niwa` to that
  directory. Hover documentation, completion, and type errors arrive
  while you write. `uninstall` removes the same file.
- **The analyzer.** `niwa check` runs `luau-analyze` when it is
  installed, and says plainly that it skipped the deeper checks when it
  is not. An implied guarantee is worse than a missing one.
- **The runtime.** Every resource validates its spec: which resource,
  which field, what was expected, and what arrived.

The shipped types are one file, and the aliases make it local to your
repo: `@niwa` is the tool's types, `@self` is your own directory. Both
names serve `require` and file sources alike, so there is one path
vocabulary rather than two. niwa never executes that file: the real API
lives in the binary, and the types describe it.

## Errors point at your config

A type error, a bad spec, and a failed command all report the same way:
the file and line in your config, what was being done, and what went
wrong. Every resource records where it was declared, so the plan and the
report can each name the line that asked for the work.

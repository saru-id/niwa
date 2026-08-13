---
title: Declared, actual, acknowledged
description: Every resource has three states, and every behavior in niwa is a comparison between two of them.
next:
  - href: /concepts/apply
    label: The apply loop
    why: it is the first comparison, turned into a run
  - href: /reference/cli/explain
    label: explain
    why: it prints this page for one resource
---

Every resource niwa knows about has exactly these three.

| State | What it is | Where it lives |
| --- | --- | --- |
| declared | what the config says | `init.luau` and the modules it requires |
| actual | what the machine is right now | package receipts, plists, the filesystem |
| acknowledged | what the last apply did | the local journal |

## The comparisons

- `declared` differs from `actual`: pending work. `plan` shows it, `apply` does
  it.
- `actual` differs from `acknowledged`: drift. You changed something by hand, so
  niwa proposes a config edit.
- `acknowledged` with nothing declared: an orphan. You deleted a line, so niwa
  offers the removal.
- After an apply, all three agree. `apply --verify` checks that by reading
  everything a second time.

The list is closed. A behavior outside these comparisons is an invention rather
than a consequence, so niwa carries none.

## Why the third state exists

Two states would be enough to make a machine match a file, but not enough to
tell one kind of difference from another. Without a record of what the last
apply did, two packages look the same: one niwa has not installed yet, and one
you installed on purpose. The only safe reading is then that the machine is
wrong.

Acknowledged separates them. A difference niwa has not applied is pending work.
A difference a person made is drift, and drift earns a proposal rather than a
correction. A machine is not corrupt because someone changed it.

## Presence is authoritative, removal is an offer

Say your config declares `jq`. On a fresh machine apply installs it, and if you
remove it by hand the next apply puts it back: the config is the authority on
presence. Delete the `jq` line instead and niwa offers to uninstall, then waits
for you to say yes. People expect that one to be automatic, and it deliberately
is not. A typo should never remove your toolchain in the middle of a workday.

## Every combination, decided

Three states, each true or false, give eight combinations, and the model is only
finished if all eight are decided in advance. A filled circle is true.

| declared | actual | acknowledged | Meaning | niwa does |
| --- | --- | --- | --- | --- |
| ● | ● | ● | in sync | nothing |
| ● | ● | ○ | already true, by hand or by history | acknowledges silently |
| ● | ○ | ● | removed without niwa knowing | apply restores it; the digest names it meanwhile |
| ● | ○ | ○ | pending work | apply does it |
| ○ | ● | ● | orphan | offers the removal |
| ○ | ● | ○ | unmanaged | proposes adding it |
| ○ | ○ | ● | gone on both sides | drops the acknowledgement silently |
| ○ | ○ | ○ | not niwa's concern | nothing |

Two rows deserve a note. Row two makes adopting a machine you already use
quiet: if the config asks for `jq` and `jq` is there, that is agreement, not an
event. Row six covers only what niwa can enumerate, packages with receipts and
the preference domains it knows; unmanaged files are infinite.

The table reads presence, and the same three states run on values, where a
file's bytes make a three-way comparison instead of a yes or no. The rule for
when to overwrite falls out of that, and it belongs to
[the apply loop](/concepts/apply).

## Identity

All of the above keys on one definition. A resource's identity is its kind plus
its natural key: `brew.formula:jq`, `defaults:com.apple.dock:autohide`,
`file:~/.zshrc`. Acknowledgements, orphans, conflict lints, undo entries, and
declined proposals all hash on that string. The typed calls lower to the same
identity as the general ones, so these two lines name one resource, not two:

```luau
niwa.dock { autohide = true }
niwa.defaults("com.apple.dock", { autohide = true })
```

Duplicates follow from it. Two declarations with the same identity and the same
spec fold into one. The same identity with a different spec is a lint error
naming both source locations. A host file on one side is the exception, and
that is the per-machine override working as intended.

## The journal, and its one appendix

Declared lives in the config repo and nowhere else, so a line the CLI wrote for
you is declared only because the CLI wrote it into the script. niwa reads
actual from the system when it needs it. Acknowledged is a journal under
`~/.local/state/niwa`: per machine, never committed, because it holds the byte
archives that make `undo` work.

The journal carries one named appendix: proposals you answered never. A refusal
has to be remembered somewhere, or niwa would ask again every day. It is neither
declared, actual, nor acknowledged, so niwa names it an appendix rather than
adding a fourth state. The verb `explain` prints the three states for one
resource, with the source location of every declaration and the one that wins.

---
title: Safety and undo
description: What niwa does before it overwrites anything, what the journal records, how far back undo reaches, and why there is no world rollback.
next:
  - href: /concepts/secrets
    label: Secrets
    why: it says what changes when the bytes being archived are sealed
  - href: /reference/cli/undo
    label: undo
    why: the flags and the exit codes of the command this page explains
---

niwa writes to your home directory, your packages, and your system
settings. Everything on this page exists so that is never frightening.

## Nothing is ever the only copy

Any write that would overwrite existing bytes archives them first. The
archive sits beside the journal, in `~/.local/state/niwa/archive/`: one
directory per resource identity, and each file is named after the digest
of the bytes it holds, so undo finds a copy without reading it.

The rule covers every path to a displaced byte: a `niwa.file` whose
target diverged, a `defaults` value being replaced, an orphan you agreed
to remove, and undo itself. Overwriting becomes moving.

If the resource's spec used a secret, the archive is sealed with this
machine's key. Otherwise undo would write your plaintext secret into the
state directory, which is the leak these rules exist to prevent.

## The overwrite ladder

One rule governs every file niwa writes. If the live bytes are the bytes
niwa last wrote, apply updates them freely. If they are bytes niwa never
wrote, apply leaves them alone and reports the resource as protected.

The choice is then yours. `niwa pull` brings the live bytes home to the
config. `niwa apply --force <target>` lets the write proceed. What force
displaces is archived first, so the ladder ends where the archive rule
starts.

## The journal

Each apply writes an entry to `~/.local/state/niwa/journal.json`. The
file holds three things: what the last apply acknowledged for every
identity, one entry per apply, and the proposals you answered "never".

An entry is a list of steps. A step is an identity and the effect it
had: a file written, a link made, a `defaults` value set, a package
installed, a service set, a Homebrew service started, a binary
installed, or an irreversible command. The journal records the digest of
what it wrote, never the content. The content is in the archive.

Neither the journal nor the archive is ever committed. Both belong to
one machine, and nothing in the config repo reads them.

## Undo reaches one apply

`niwa undo` walks the most recent entry, newest effect first. Files
restore from the archive. A `defaults` value goes back to what it was.
Packages that the run installed are uninstalled. Undo prints what it is
about to reverse and asks first, the same plan-then-confirm shape apply
has, and `--yes` skips the question.

The walk ends at the entry's boundary. One undo reaches one apply.

Each reversed step leaves the journal before the next one begins. If a
step fails, or you stop the run, the remainder sits exactly where the
next `niwa undo` finds it, and undo counts what came back and what did
not.

`niwa.run` and `niwa.once` are recorded as irreversible. Undo names
those steps rather than skipping them quietly, and never counts them. An
irreversible marker also survives the walk, so a later apply does not
run a `once` body a second time.

## Verifying the run

`niwa apply --verify` re-reads everything once the run is over and
demands silence. Anything that still reports a change is not idempotent,
and niwa names the resource and the source line that declared it. The
run then exits 1.

That is the literal definition of the property the rest of the tool
rests on, and it costs one extra read-only pass. It is opt in, because
doubling the time on a converged machine is when you need it least.

## Ninety days

Archived bytes are pruned ninety days after they were written. One thing
overrides the horizon: bytes that a journal entry still references stay
whatever their age, because undo needs them. Pruning is best effort, so
a file that will not delete today deletes on a later run.

`niwa doctor` reads the archive and reports how many copies opened.
`doctor --deep` decrypts the sealed ones as well. An archive nobody can
read is a broken undo, and that is worth learning before you need it.

## Why there is no world rollback

niwa keeps no generations. There is no state from six weeks ago to
return to, and nothing rebuilds the machine as it stood on a date.

Two things stand in its place. Undo the last apply, or revert the config
in git and apply again. `niwa history` browses the applies before the
most recent one, so the record is still there to read.

The reason is cost. A world rollback means niwa owning every version of
every package and file it ever wrote, and a store to keep them in. That
is a different project, and the last apply is what people ask for.

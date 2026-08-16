---
title: What niwa will not do
description: The refusals, with the reason for each, and the limits that are genuinely constrained rather than chosen.
next:
  - href: /guides
    label: Guides
    why: what the tool does do, one task at a time
  - href: /concepts/safety
    label: Safety and undo
    why: the two mechanisms that stand in for the rollback this page refuses
---

A tool is defined as much by what it refuses. The refusals below are
decided, not open, and each one carries its reason.

## niwa never decides to change your machine

The watcher notices things and posts a notification. Applying is a
person's call, and no timer inside niwa changes your machine on its own.

The exception is the one you write. A `niwa.service` that runs
`apply --yes` on a schedule is auto apply you declared: reviewable in
the same config it governs, and revocable by deleting the lines that
declare it. niwa carries out a standing decision. It does not make one.

## No world rollback

There are no generations. Undo the last apply, or revert the config in
git and apply again. Keeping a machine's whole history would mean owning
every version of every package and file niwa ever wrote, which is a
different project.

## No dependency graph

Program order is the order. You asked for steps, and a program already
has steps. A graph would ask you to describe an ordering you had already
written down, and would then be free to disagree with you about it.

## No parallel execution

Batching happens inside a provider: twelve formulae become one install
command. Two independent groups still run one after the other, because
determinism is worth more than the seconds. A run whose order changes
between machines is a run whose failures cannot be reproduced.

## No purity and no bit reproducibility

The lockfile pins versions, which is where the practical value sits.
Guaranteeing byte-identical output would mean a build sandbox, a store,
and a model of the machine that no longer looks like macOS.

## No general way to edit one line in a file

`niwa.file` owns whole files. There is no primitive that manages one
line inside a file somebody else owns. The moment one exists, every file
on the machine is partly owned, and `niwa pull` stops meaning anything,
because there is no longer an answer to what the config is responsible
for. If you want a managed line in `.zshrc`, own `.zshrc`. Two system
files cannot follow the rule, because everything on the machine coexists
in them: `/etc/hosts` and `/etc/shells` are declared entry by entry
instead, each entry with its own identity.

## No privilege escalation

niwa asks for no password and calls no authorization service.
Steps that need administrator rights are listed at the top of the run,
with the source line that declared each one, and they run with the
rights you have. `apply --no-privileged` skips them whole.

## What you give up, stated once

Three things, if you use niwa at all. You own a config file: niwa writes
the first draft by scanning the machine, and proposes edits from then
on, but the file is yours to keep. Deleting a line produces an offer to
remove, not a removal, so a tidy config and a tidy machine are two
separate acts. And there is no world rollback, as above.

## Honest limits

These are constrained rather than chosen.

**The plan is approximate past the first change.** A guard can depend on
an earlier install, so a prediction after that point is an estimate, and
`niwa plan` says so when the config read a result and more than one
change is pending.

**Some permissions cannot be checked.** Accessibility and full disk
access are not readable without already holding them, so they are
checklist items with remembered acknowledgements, never a check niwa
pretends to have run.

**Some settings are not in preference files.** If `defaults` can say it,
niwa can govern it. Wallpaper, login items, and the default browser live
behind other interfaces, reachable only through `niwa.run`.

**The repo is the trust boundary.** Your config is code, and it runs
with your privileges by your choice. The sandbox makes the effects
reportable. Whoever can push to that repository can change your machines.

**Idempotence is a property of your guards.** Required guards, `changed`
results, and `--verify` make it easy and provable, and none of them can
make a wrong guard right.

**niwa loses to managed preferences on purpose.** A preference your
organization manages is readable as managed, so declaring it fails the
plan with the real owner named.

**`niwa uninstall` removes niwa and leaves the machine as it stands.**
There is no control that undoes everything niwa ever did. Removing a
tool must not be a way to lose years of work by accident.

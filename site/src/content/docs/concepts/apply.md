---
title: The apply loop
description: Three phases, two passes of your script, and a failure that leaves a partial machine rather than a broken one.
next:
  - href: /concepts/checklist
    label: The checklist and manual steps
    why: it is the half of a run that a person does
  - href: /concepts/safety
    label: Safety and undo
    why: it says what a run archives, and how to reverse one
---

`niwa apply` is three phases, and almost everything else on this page is a
consequence of that one decision.

| Phase | What happens |
| --- | --- |
| The plan | niwa runs your script with every effect suppressed. Guards read the machine, so they all evaluate, and every resource reports what it would do. |
| The confirm | niwa shows the plan and asks once. `--yes` skips the question, `--interactive` walks the changes one at a time. |
| The work | niwa runs the same script again, effects live, in program order. |

Because the plan comes first, niwa knows before anything starts which steps
need administrator rights and which need a person. That is what pays for the
privilege block and the checklist below.

## One program, two passes

Your script runs twice: once to predict, once to act. Two things follow.

Predictions past the first change are approximate. In the first pass a
resource that would change reports a predicted result, and a later guard
branching on that result may resolve differently once the change is real. The
plan marks where prediction begins rather than claiming to know.

Your config code may branch, but it may not act. Top-level code runs in both
passes, so it has to be declaration plus branching, and the sandbox already
guarantees that: every effect goes through a resource, and resources are
suppressed in the first pass. There is no way to write config code that acts
during planning by accident.

When the plan comes back empty, apply ends there. That short circuit is the
normal case, not a footnote.

## The confirmation, and the one thing it refuses

The question is asked once, before any work. `--yes` answers it in advance,
and carries one extra obligation: unattended, apply refuses a config tree with
uncommitted changes. Locally, applying uncommitted edits is the iteration loop
and stays allowed. Unattended, uncommitted means someone forgot to commit, and
a run nobody watched would produce a machine that no commit describes.
`--yes --dirty` exists for the day you mean it.

## Privileged steps, named at the top

Some of the system needs administrator rights: hostname, the firewall,
`/Library` preferences. niwa lists those steps before the run starts, each
with the file and line that declared it, so you read them as a group rather
than meeting them one at a time.

niwa asks for no password and escalates nothing. Privileged steps run with the
rights you already have, which is the other reason they are named up front: if
you do not hold those rights, you know before the run and not after.
`--no-privileged` skips that whole group and runs the rest, which is what makes
an unattended converge reasonable.

## When something fails

A failed resource stops the run rather than cascading into forty downstream
errors. Two opt-outs exist: `optional = true` on a spec that accepts it, and
`niwa.try` around a block. An optional failure still produces a result, with
`failed = true`, so a config can install something nice to have and configure
it only if it arrived.

The error ends with two counts: how many changes were applied, and how many
were not reached. That second number is the point. It says the machine is in a
coherent partial state and not a corrupted one, and re-running is the resume,
because everything already done is skipped.

An interruption is the same story. The journal is written per resource as
effects land, never as one entry at the end, so a stopped run leaves the same
partial state as a failed one. One apply runs at a time, under an exclusive
lock, while `plan`, `check`, and the watcher only read and never wait on it.

## Overwriting a file

One rule governs file overwrites, and it falls out of the model rather than
being policy. If the live bytes are the bytes niwa last wrote, actual matches
acknowledged, and apply updates the file freely, archiving the old bytes
first. If the live bytes are bytes niwa never wrote, apply does not guess: it
shows the diff and offers `pull` or a `--force` for that target.

On a first apply nothing is acknowledged yet, so every differing file is
protected. That is why adopting a machine you already use starts with `pull`
rather than with apply.

## Speed is a constraint, not a hope

The budget: a converged machine applies in under a second at roughly two
hundred resources. A benchmark drill in the tool's own test suite holds it
there, and two rules keep it honest.

niwa samples once. Checks read receipts and plists instead of invoking package
managers, and every query is memoised for the run, so twenty guards asking the
same question cost one answer.

Order is about effects, not fetches. Downloads prefetch in the background while
checks run, and effects still land in program order. Resources from the same
provider batch into one invocation, and reading any field of a pending result
flushes the batch first, so `changed` is always the truth. There is no parallel
execution beyond that: determinism is worth more than the seconds it saves.

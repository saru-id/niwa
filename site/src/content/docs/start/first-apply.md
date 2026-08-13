---
title: Your first apply
description: plan says what would change, apply makes it true, and both print the same list.
next:
  - href: /start/adopt
    label: Adopt a machine you already use
    why: a lived-in Mac needs one more step before its first apply
---

## Read the plan first

```shell
niwa plan
```

`plan` runs your config with every effect suppressed. Guards still read the
machine, so niwa evaluates every branch. Resources report what they would do
and do nothing.

```screen
fixture: plan_mixed_pending_color
command: niwa plan
```

Four things to read there.

- The rule above a block is a module name. Output groups by the file the
  declarations live in.
- `+` is created, `~` is changed. A changed value shows both sides:
  `false → true`.
- The bold half of a line is the resource's identity: a kind and its natural
  key, as in `brew.formula:fd`. That string is what `niwa explain` takes.
- The last line counts what was checked against what would change.

The dim line under the count is the honest part. plan runs the script once and
apply runs it again. A guard that branches on a change further up the file can
resolve differently once that change is real. The plan marks where prediction
begins rather than claiming to know.

`niwa plan --diff` renders the full file diffs, highlighted word by word.

## Exit codes

plan is the one verb with a third code, so a script can gate on it.

| Code | State |
| --- | --- |
| `0` | the machine matches the config |
| `2` | changes are pending |
| `1` | an error |

Every other verb keeps the shared shape: `0` is success, `1` is an error.

## Apply

```shell
niwa apply
```

apply is three phases: plan, confirm, execute. It prints the plan you just
read, then the manual steps only a person can do, then the steps that need
administrator rights. Then it asks once. Answer `y` and it runs, in program
order.

- `--yes` skips the question. Unattended it refuses a config tree with
  uncommitted changes, unless `--dirty` joins it.
- `--interactive` steps through every change, one decision at a time.
- `--verify` re-checks everything afterwards and fails when anything still
  reports a change.

With no terminal and no `--yes`, apply stops and says it needs a confirmation
rather than deciding for you.

## Read what happened

The closing line counts what was checked and what changed, names anything that
failed or stayed protected, and gives the elapsed time. A restart a declaration
asked for is coalesced: many writes to one domain restart it once, at the end.

apply exits 0 when every step succeeded. It exits 1 on an error, on a cancel at
the confirmation, and when `--verify` finds work still pending.

A failed resource halts the run instead of cascading. The journal already holds
every effect that landed, so re-running resumes and skips the work that is
done. `niwa undo` reverses the most recent apply, newest effect first.

Run `niwa plan` again. On a converged machine it prints one line and exits 0,
and that is the normal case from here on.

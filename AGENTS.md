# AGENTS.md

niwa is a configuration tool for macOS. One Luau script declares what a
machine should be. niwa makes it true, shows its work, and can undo it.

The specification is the niwa design document, maintained alongside
this repository and versioned separately. When code and design
disagree, stop and resolve the disagreement. Do not improvise.

## The gates

Run `make check` before and after your work: formatting, clippy, all
tests, snapshots, and dependency checks. It must pass with no warnings
before every commit. Run `make verify` before you call any work
finished: it adds the drills and the coverage report. Neither gate is
ever skipped.

## Code rules

- Less code is better. If a simpler way exists, use it. Delete freely.
- Every abstraction must be needed by code that exists today.
- No `unsafe` code. No `unwrap` or `expect` outside tests.
- All user-visible text goes through the output module, follows the
  interface chapter of the design, and is covered by a snapshot test.
- Errors answer four questions, in order: what was being done, what
  happened, what to do next, and what state the machine is in.
- Tests and drills never touch the real home directory, real
  preferences, real services, or real package managers. They run in
  sandboxes. Every spawned process has a timeout.

## Prose rules

These apply to the README, doc comments, help text, and error messages.

- Short sentences. One idea per sentence. Common words.
- Active voice. No idioms. No jokes. Write "for example", not "e.g.".
- Do not name or compare with other tools.

## Comments

- A comment states a constraint the code cannot show: a reason, a
  boundary, a consequence. Never a narration of the next line.
- Present tense, about the code as it stands. No milestones, no
  "for now", no "when it lands".
- Every hard-coded deadline or threshold carries the reason for its
  number.

## Commits

- Conventional Commits: `feat:`, `fix:`, `test:`, `docs:`, `refactor:`,
  `chore:`. Imperative subject under 65 characters, no trailing period.
- Body only when the why is not visible in the diff.
- Every commit passes `make check`. Every commit is public history.
- Do not push to any remote.

## Dependencies

- A new crate needs an entry in `docs/dependencies.md` first: what it
  does, why we did not write it ourselves, its maintenance state, and
  its license. `cargo deny check` must pass.

## Do not

- Do not add CI configuration. That happens at 1.0.0, not before.
- Do not add telemetry or any network call the user did not ask for.
- Do not commit process artifacts: plans, notes, and ledgers live
  outside this repository.

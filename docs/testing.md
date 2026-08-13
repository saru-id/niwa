# Testing

The goal is meaningful full coverage of everything reachable without
mutating a real machine, measured with `cargo llvm-cov`. Every
carve-out is documented here.

## The tiers

- **Unit tests** live beside the code they prove.
- **Integration tests** (`tests/`) drive the real binary in a
  throwaway home. They never touch the developer machine: `HOME`
  points at a temporary directory, the environment is cleared, and
  stub executables stand in for system tools.
- **Drills** (`drills/`) are
  hermetic end-to-end scenarios with numbered, self-checking steps.
  They assert on files, never by evaluating captured output.
- **Snapshots** cover every screen the design mocks, through the one
  output layer.
- **Simulations** run property-based converge, drift, and undo cycles
  against the model's invariants.

Anything that genuinely needs a real machine goes in a clearly named
manual tier that no gate runs.

## Subprocess coverage

Integration tests clear the environment before spawning the binary.
The helpers pass `LLVM_PROFILE_FILE` back through, so an instrumented
child writes its profile where `cargo llvm-cov` expects it instead of
littering `default_*.profraw` into the working directory, and the
coverage report sees the code that only the spawned binary exercises.
Drills inherit the variable from the calling shell for the same
reason.

## Coverage, and what stays uncovered on purpose

`make coverage` merges both testing tiers — the cargo tests and the
drills — over one instrumented binary; drills carry most of the verb
coverage, so a report without them reads falsely thin.

Some territory is uncovered by design, not by neglect. The list, so
nobody re-derives it:

- **Interactive walks.** The pull review walk, interactive apply,
  and the dashboard's key dispatch need a person at a terminal.
  Their piped shapes are tested; the key-driven paths are manual
  tier.
- **The real machine's providers.** Password prompts under
  privileged apply, the real keychain, the real launchd, and the
  real package managers stay out of every gate by law. Drills prove
  the same code against stubs and receipts.
- **`self update`.** There is no release channel at this version;
  the verb's one honest refusal is tested, the fetch-verify-swap it
  will grow is not written.
- **Narrow-terminal reflow.** Truncation keeps the tail of a path and
  wide characters count by columns (both unit-tested); reflowing prose
  to a narrow width is not implemented at this version, so there is
  nothing further to cover.
- **`once` under interruption.** The marker lands after the body, so
  a run killed between the two repeats the body on the next apply:
  at-least-once, stated in the API docs. Driving a kill into that
  window is timing-dependent; the manual tier carries it.
- **Custom `reverse` through undo.** Validated at definition,
  journaled irreversible by name; driving the handler from undo
  lands after 0.1.0 (deviations ledger).

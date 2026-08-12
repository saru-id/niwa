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
- **Drills** (`drills/`, arriving with the execution engine) are
  hermetic end-to-end scenarios with numbered, self-checking steps.
  They assert on files, never by evaluating captured output.
- **Snapshots** cover every screen the design mocks, through the one
  output layer.
- **Simulations** run property-based converge, drift, and undo cycles
  against the model's invariants.

Anything that genuinely needs a real machine goes in a clearly named
manual tier that no gate runs.

## Known gaps

- **Subprocess coverage.** Integration tests clear the environment
  before spawning the binary, which also clears `LLVM_PROFILE_FILE`,
  so `cargo llvm-cov` cannot see code exercised only through the
  spawned binary (`main.rs`, `out.rs`, `paths.rs`, the verbs). The
  test helpers will pass the coverage variables through before the
  coverage target becomes a gate. Until then the coverage report
  understates what the integration tests prove.

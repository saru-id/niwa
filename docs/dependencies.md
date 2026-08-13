# Dependencies

Every crate niwa depends on has an entry here before it lands. Each entry
answers: what it does for niwa, why we did not write it ourselves, its
maintenance state, its transitive weight, and its license. `cargo deny check`
enforces the license and source policy in `deny.toml`.

## Runtime

### clap

- Does: command line parsing and help text for the whole verb surface.
- Why not our own: correct argument parsing with good help output is a large,
  finished problem. clap is the community standard and its derive form keeps
  the surface declared in one place.
- Maintenance: actively maintained by a team, frequent releases, used by
  cargo itself.
- Weight: moderate (clap_builder, clap_derive, anstream, anstyle, strsim).
  niwa uses the derive feature only.
- License: MIT OR Apache-2.0.

### mlua

- Does: embeds the Luau virtual machine and compiler, with the safe Rust
  bindings the whole config layer is built on: sandboxing, memory limits,
  interrupt callbacks, and table freezing.
- Why not our own: bindings to a C++ virtual machine are years of unsafe
  code review. mlua is the standard embedding for Lua and Luau in Rust and
  keeps every unsafe block on its side of the boundary.
- Maintenance: actively maintained, frequent releases, tracks upstream
  Luau closely.
- Weight: moderate. The `luau` feature vendors and builds Luau itself;
  there is no system dependency.
- License: MIT (mlua and the vendored Luau sources).

### thiserror

- Does: derives `std::error::Error` for the library-shaped error types.
- Why not our own: hand-written `Display` and `Error` impls for every variant
  is boilerplate that hides the real definitions.
- Maintenance: dtolnay, current, ubiquitous.
- Weight: one proc-macro crate.
- License: MIT OR Apache-2.0.

### plist

- Does: reads and writes Apple property lists, binary and XML, so the
  `defaults` provider inspects preference files directly instead of
  shelling out to the `defaults` tool.
- Why not our own: the binary plist format is fiddly and versioned;
  a correct reader is a project of its own.
- Maintenance: the standard Rust plist crate, current, used widely on
  macOS tooling.
- Weight: small (quick-xml, base64, time).
- License: MIT.

### serde and serde_json

- Does: serialization for the journal and the `--json` interface.
- Why not our own: serde is the Rust serialization layer; a hand-rolled
  format would be a liability in a schema-versioned file.
- Maintenance: dtolnay, current, foundational to the ecosystem.
- Weight: moderate at compile time, zero extra at run time.
- License: MIT OR Apache-2.0.

### sha2

- Does: SHA-256 digests, for acknowledging file bytes in the journal
  and verifying release checksums later.
- Why not our own: rewriting a cryptographic hash is how tools get
  quietly wrong hashes.
- Maintenance: RustCrypto team, current.
- Weight: small (digest, cpufeatures).
- License: MIT OR Apache-2.0.

### age

- Does: seals secrets and undo archives — X25519 identities for file
  encryption, scrypt passphrases for the escrowed key backup.
- Why not our own: file encryption is the one place where writing it
  yourself is the mistake. age is a small, audited format built for
  exactly this shape of problem.
- Maintenance: the reference Rust implementation, actively maintained.
- Weight: the largest tree here (curve and AEAD crates, BSD-3-Clause
  dalek crates among them), all pure Rust.
- License: MIT OR Apache-2.0; curve25519-dalek and friends BSD-3-Clause.

### jiff

- Does: timestamps for stamps and acknowledgements, and the humanized
  "2h ago" durations the interface chapter asks for.
- Why not our own: civil time arithmetic and ISO 8601 formatting are
  precisely the wheels not to reinvent.
- Maintenance: BurntSushi, current, releases often.
- Weight: self-contained.
- License: Unlicense OR MIT.

### toml

- Does: reads and writes the lockfile and the per-machine stamps.
- Why not our own: TOML has enough grammar corners that a hand parser
  is a liability in files people edit.
- Maintenance: the toml-rs team, current, used by cargo itself.
- Weight: small (toml_edit, winnow).
- License: MIT OR Apache-2.0.

### similar

- Does: the diffs behind `plan --diff`, word-level highlighted, the
  library the design names for it.
- Why not our own: good diffs are an algorithm family (Myers, inline
  emphasis, grouping), not an afternoon.
- Maintenance: mitsuhiko, current, widely used; already in the tree
  as insta's engine.
- Weight: small (no new transitive dependencies).
- License: Apache-2.0.

### unicode-width

- Does: measures strings in terminal columns, so alignment and
  truncation stay correct for characters wider than one cell.
- Why not our own: the East Asian width tables are large, versioned
  with Unicode, and wrong to approximate.
- Maintenance: the unicode-rs team, current, used across the
  terminal ecosystem.
- Weight: tiny, no dependencies.
- License: MIT OR Apache-2.0.

## Development

### insta

- Does: snapshot testing. Every screen the design mocks is an insta
  fixture, and a degraded screen is a red gate.
- Why not our own: snapshot review workflow (`cargo insta review`) and
  stable serialization are the value; both are finished problems.
- Maintenance: mitsuhiko, current, widely used.
- Weight: dev-only (console, similar).
- License: Apache-2.0.

### tempfile

- Does: temporary directories for tests, cleaned up on drop. Every test that
  needs a home directory builds a throwaway one with it.
- Why not our own: safe temp path creation has race and cleanup subtleties
  that are not worth re-deriving.
- Maintenance: current, widely used.
- Weight: small (fastrand, rustix).
- License: MIT OR Apache-2.0.

### proptest

- Does: the property simulations. Generated machines assert that
  apply converges, converged applies change nothing, and undo
  restores what stood before.
- Why not our own: shrinking is the value — a failing case arrives
  minimal, not forty resources deep — and shrinking is the hard part.
- Maintenance: the proptest-rs team, current, widely used.
- Weight: dev-only (rand and friends).
- License: MIT OR Apache-2.0.

# Dependencies

Every crate niwa depends on has an entry here before it lands. Each entry
answers: what it does for niwa, why we did not write it ourselves, its
maintenance state, its transitive weight, and its license. `cargo deny check`
enforces the license and source policy in `deny.toml`.

## Runtime

### clap

- Does: command line parsing, help text, and shell completions for the whole
  verb surface.
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

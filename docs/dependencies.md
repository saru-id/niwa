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

## Development

### tempfile

- Does: temporary directories for tests, cleaned up on drop. Every test that
  needs a home directory builds a throwaway one with it.
- Why not our own: safe temp path creation has race and cleanup subtleties
  that are not worth re-deriving.
- Maintenance: current, widely used.
- Weight: small (fastrand, rustix).
- License: MIT OR Apache-2.0.

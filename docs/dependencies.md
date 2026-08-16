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
  and verifying release checksums.
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

## Site dependencies

The documentation site under `site/` is a separate build with its own
package manager. It ships no code to the tool and is never linked into
the binary. Every version is pinned exactly, because several of these
packages are alpha or beta and treat a minor as breaking.

### astro

- Does: builds the site to static HTML — routing, the content loader, the
  asset graph, and the dev server.
- Why not our own: a static site generator with content collections and a
  build pipeline is a large finished problem, and the design site already
  proved this one on the same content.
- Maintenance and weight: released weekly, 51 direct dependencies, build
  time only.
- License: MIT.

### sharp

- Does: encodes the site's images at build time. It is the image service Astro
  bundles, and every derivative a page requests through `getImage()` comes out
  of it.
- Why not our own: an image encoder is a codec suite. sharp binds libvips,
  which carries the AVIF and PNG encoders the site's image budgets are
  calibrated against.
- Maintenance and weight: current, build time only. It is not a direct
  dependency: the lockfile pins it at 0.35.3 under the `astro@7.2.1`
  resolution, and that pin is load-bearing. A second sharp, 0.35.2, sits under
  the wrangler toolchain and takes no part in the build. Moving the build's
  sharp changes every encoded byte, so a lockfile refresh that moves it
  re-opens the image budget measurements. A hoist setting in
  `site/pnpm-workspace.yaml` places the same package at `node_modules/sharp`,
  because Astro's built chunks import it bare from paths the isolated layout
  does not serve.
- License: Apache-2.0.

### @astrojs/react

- Does: lets React components render inside Astro pages.
- Why not our own: it is the supported bridge between the two renderers,
  and every component on the site renders at build time through it.
- Maintenance and weight: released alongside Astro, adds the Vite React
  plugin.
- License: MIT.

### react and react-dom

- Does: the component model the styled components and the markdown
  renderer are written in. Both run at build time; no page loads them.
- Why not our own: the rendering pipeline the site ports is React, and so
  is every library it consumes.
- Maintenance and weight: the reference implementation, current, build
  time only.
- License: MIT.

### @tanstack/markdown

- Does: parses the documentation markdown and renders it to HTML at build
  time, including heading ids, heading anchors, and the hook the
  highlighter plugs into.
- Why not our own: a markdown parser is a specification, not a weekend. It
  has no dependencies, its tree is plain data, and the design site already
  proved it on this content.
- Maintenance and weight: alpha, and pinned exactly for that reason — the
  package is 0.0.x, its announcement says the contract can still move, and
  every class name the stylesheet targets is an implementation detail.
  Build time only, no dependencies.
- License: MIT.

### @tanstack/highlight

- Does: turns a code fence into coloured spans at build time. It ships the
  shell, TOML and JSON grammars, takes the site's own Luau grammar, and
  bridges to the markdown renderer.
- Why not our own: it is synchronous, has no dependencies and no WASM, and
  its grammars are plain scanning functions, which is what let the Luau
  grammar be written by hand at all.
- Maintenance and weight: alpha, and pinned exactly for that reason — 0.0.x
  with the same warning as the markdown package. Build time only, no
  dependencies.
- License: MIT.

### @stylexjs/stylex

- Does: component styles, compiled to atomic CSS at build time, reading
  the theme tokens as plain custom properties.
- Why not our own: hand-written CSS for sixty-two pages drifts. StyleX
  makes a style a value the type checker sees, with no runtime.
- Maintenance and weight: Meta, releases every few months, three small
  runtime dependencies and 334 KB unpacked.
- License: MIT.

### @stylexjs/unplugin

- Does: runs the StyleX compiler inside Astro's Vite build. It is the only
  door, because the React integration has no place to pass a Babel plugin.
- Why not our own: the compiler is a Babel plugin with its own CSS
  collection and ordering rules; wiring it by hand is the same code with
  fewer eyes on it.
- Maintenance and weight: released with StyleX, build time only, pulls
  Babel, browserslist and lightningcss.
- License: MIT.

### unplugin

- Does: the bundler abstraction `@stylexjs/unplugin` is built on. It is
  declared here because that package leaves it as an unmet peer.
- Why not our own: it is not ours to write; it is a peer we have to name.
- Maintenance and weight: current, build time only, pinned to the 2.x line
  the StyleX plugin asks for.
- License: MIT.

### @astrojs/check

- Does: type checks `.astro` files, which no plain TypeScript compiler
  can parse.
- Why not our own: it wraps the Astro language server, which is the same
  program the editor runs. A second implementation would disagree with
  the editor.
- Maintenance and weight: current, dev only, brings the language server
  and Volar.
- License: MIT.

### typescript and typescript-7

- Does: two compilers. `typescript` is 6.0.3, the version `astro check`
  and editors load. `typescript-7` is the native 7.0.2 compiler, and it
  checks the plain `.ts` and `.tsx` sources.
- Why not our own: two exist because `astro check` needs a programmatic
  API the native compiler does not ship yet. `site/README.md` records the
  reason and the end of it.
- Maintenance and weight: both current releases of their lines, dev only.
- License: Apache-2.0.

### @types/node, @types/react and @types/react-dom

- Does: the type declarations for Node, React and the DOM renderer.
- Why not our own: they are the published descriptions of libraries we
  did not write.
- Maintenance and weight: DefinitelyTyped, current, dev only, no code.
- License: MIT.

### vitest

- Does: runs the Worker's recognition tests.
- Why not our own: it reads the same Vite config the site builds with, so
  a test imports a module exactly as the build does.
- Maintenance and weight: current, dev only, shares the bundler already
  installed.
- License: MIT.

### wrangler

- Does: runs and deploys the Cloudflare Worker that serves the apex, and
  serves the built site locally.
- Why not our own: it is the platform's own tool. There is no other way to
  deploy the Worker.
- Maintenance and weight: current, dev only, brings the local runtime
  (workerd, miniflare).
- License: MIT OR Apache-2.0.

### pagefind and astro-pagefind

- Does: builds a static, chunked search index over the built pages, and
  ships the modal search interface the header opens. astro-pagefind runs
  the indexer as part of the Astro build.
- Why not our own: client-side search over a static site with ranked
  excerpts is a solved, subtle problem; the index format and its lazy
  loading are the value.
- Maintenance and weight: both current; the indexer is a platform binary
  that runs at build time only, the interface is a small script loaded on
  demand.
- License: MIT (both).



### @astryxdesign/core

- Does: the design system the site's interface is built from. It ships
  155 React components, one pre-compiled stylesheet for all of them, and
  the theme compiler the site's own theme is written against. The
  components render to HTML during the build; the theme compiles to a
  static stylesheet.
- Why not our own: the site needs tables, headings, dividers and, later,
  the controls that carry state. Every one of those has keyboard
  behavior, an accessible name and two colour modes to get right, and
  the theme compiler is what lets the site's measured OKLCH tokens drive
  all of it from one place.
- Maintenance and weight: 0.3.0, released weekly, pinned exactly for
  that reason. One runtime dependency. The stylesheet is 138 KB and is
  not split by component, so every page carries all of it.
- License: MIT.

### @astryxdesign/cli

- Does: compiles `src/theme/niwa.theme.ts` into the stylesheet and the
  built theme object the site loads, and answers questions about the
  component API while the site is being written. `pnpm run check:theme`
  runs it in check mode, so a theme edited without a rebuild fails the
  gate.
- Why not our own: it is the compiler for the package above and the only
  supported way to reach the static output an SSR build needs.
- Maintenance and weight: 0.3.0, released with the core package and
  pinned to the same version, which its themes require. Four
  dependencies, build time only.
- License: MIT.

# Dependencies

Every crate niwa depends on has an entry here before it lands, and so does
every GitHub Action and every tool the gates run. Each entry answers: what
it does for niwa, why we did not write it ourselves, its maintenance state,
its transitive weight, and its license. An action or a tool binary has no
transitive tree inside this repository, so its entry answers how it is
pinned in place of what it weighs. For the crates in the dependency graph,
`cargo deny check` enforces the license and source policy in `deny.toml`.

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

### cargo-llvm-cov

- Does: produces the coverage report `make verify` adds. It instruments
  the test build, runs the cargo tests and the drills against one
  instrumented binary, and merges the result.
- Why not our own: coverage needs the compiler's own instrumentation and
  llvm's profile tooling, driven with matching flags. The tool exists to
  get those flags right.
- Maintenance: one author with help, current, tracks new Rust releases.
- Pin: none enforced; 0.8.7 is the version the coverage run is exercised
  with. It runs on developer machines only, so CI does not pin it.
- License: Apache-2.0 OR MIT.

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
- Maintenance and weight: released weekly, 52 direct dependencies, build
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
  and every React component on the site renders at build time through it.
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
  shell, TOML, JSON and plaintext grammars, takes the site's own Luau
  grammar, and bridges to the markdown renderer.
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

- Does: runs every test the site has, under `src/` and under `worker/`.
- Why not our own: it runs on the same bundler the site builds with, so a
  test imports a module exactly as the build does.
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
- Pin: exact. pagefind is a platform binary that astro-pagefind invokes at
  build time, and an exact pin is what keeps the binary a known quantity
  across machines.
- License: MIT (both).

## GitHub Actions

The workflows under `.github/workflows/` use these actions and install
these tools on the runners. Each action is pinned to a full commit SHA,
with its tag named in a trailing comment. Each tool is pinned to an exact
version. Every pin is refreshed by hand, and its entry is updated in the
same commit. These entries carry a pin in place of a weight, because
neither an action nor a tool binary has a transitive tree inside this
repository. None of this links into the binary or ships on the site.

### actions/attest-build-provenance

- Does: signs a provenance attestation for each release archive. The
  attestation records which workflow run built the file and from which
  commit, and `gh attestation verify` checks it against the downloaded
  bytes.
- Why not our own: the signature is issued against the run's OIDC token
  and recorded in a public transparency log. Writing that exchange
  ourselves means writing a signing protocol and a log client, and the
  verifier accepts only this format.
- Maintenance: GitHub, current, released alongside the attestation API it
  calls.
- Pin: v4.2.2, pinned by commit and not by tag. A tag moves, and this
  action signs in the repository's name.
- License: MIT.

### actions/checkout

- Does: clones the repository onto the runner, so every job reads the
  tree it tests. Every use sets `persist-credentials: false`, so the job
  token does not stay in `.git/config` for a later step to find.
- Why not our own: the action handles pull request merge refs, fetch
  depth, and the credential cleanup afterwards. That is git plumbing we
  would carry ourselves for no gain.
- Maintenance: GitHub maintains it, current.
- Pin: v7.0.1, pinned by commit.
- License: MIT.

### actions/dependency-review-action

- Does: on a pull request, compares the dependency graph of the base and
  the head, and fails on a dependency with a known vulnerability. The
  graph here is `Cargo.lock` and the pnpm lockfiles; an action pinned to
  a commit produces no graph entry to alert on.
- Why not our own: the graph and the advisory data are GitHub's. The
  action is the supported way to read the difference between two commits.
- Maintenance: GitHub maintains it, current.
- Pin: v5.0.0, pinned by commit.
- License: MIT.

### actions/setup-node

- Does: installs the exact Node version the site gate runs on. The
  workflows do not use its `cache:` option, because that mode calls pnpm
  before Corepack has installed pnpm.
- Why not our own: it resolves the official Node build for the runner
  platform and puts it on PATH.
- Maintenance: GitHub maintains it, current.
- Pin: v7.0.0, pinned by commit.
- License: MIT.

### actions/upload-artifact

- Does: keeps the Scorecard SARIF file on the workflow run, so a scan can
  be read after the fact without running it again.
- Why not our own: the artifact store is reached through the runner's own
  credentials and API. Only this action holds them.
- Maintenance: GitHub, current, one of the actions the platform ships.
- Pin: v7.0.1, pinned by commit.
- License: MIT.

### github/codeql-action

- Does: runs the CodeQL analysis on the runner and sends the results to
  code scanning. `init` prepares the analyzer for one language, `analyze`
  runs the queries and uploads what they found, and `upload-sarif` posts
  a SARIF file another tool produced.
- Why not our own: the analyzer, the query packs, and the SARIF endpoint
  are all GitHub's. This action is the only supported way to reach them
  from a workflow.
- Maintenance: GitHub, released every few weeks, versioned alongside the
  CodeQL bundle it downloads.
- Pin: v4.37.7, pinned by commit, the same commit for all three entry
  points. A tag moves and a commit does not, and this action runs with
  the workflow token.
- License: MIT.

### ossf/scorecard-action

- Does: scores this repository against the Scorecard checks — branch
  protection, pinned dependencies, workflow permissions, release signing
  — and writes the result as SARIF.
- Why not our own: the checks are the project's own definition of the
  score. A second implementation would produce a number that means
  something else, and the published score is the point.
- Maintenance: the Open Source Security Foundation, current, released a
  few times a year.
- Pin: v2.4.4, pinned by commit.
- License: Apache-2.0.

### Swatinem/rust-cache

- Does: caches the cargo registry and `target/` between runs. Building
  the vendored Luau inside mlua is the expensive part of both gates, and
  the cache is what keeps it off most runs.
- Why not our own: a correct Rust cache is cache-key design — the
  toolchain, the lockfile, the enabled features — plus knowing which
  parts of `target/` must never be restored. The action already encodes
  those rules.
- Maintenance: one author, current, widely used in Rust CI.
- Pin: v2.9.2, pinned by commit.
- License: LGPL-3.0-only. It runs on the runner only. Nothing it touches
  links against it.

### taiki-e/install-action

- Does: installs prebuilt binaries for the tools the gates need:
  cargo-deny for the tool gate, zizmor and shellcheck for the workflow
  lint. Building them from source on every run costs more than the gates
  themselves.
- Why not our own: it carries a checksummed manifest per tool and per
  platform, and it follows upstream release layouts as they change. A
  hand-written download step per tool is the same work, repeated, with
  fewer eyes on it.
- Maintenance: one author, releases most days, picks up new tool versions
  within days of their release.
- Pin: v2.86.1, pinned by commit. Every use also sets `fallback: none`,
  so an install the manifest does not cover fails instead of resolving at
  run time.
- License: Apache-2.0 OR MIT.

### Rust toolchain

- Does: compiles the tool. `rustup toolchain install` reads
  `rust-toolchain.toml` and installs the channel it names, with clippy and
  rustfmt beside it.
- Why not our own: it is the compiler.
- Maintenance: the Rust project, releases every six weeks.
- Pin: channel 1.97.0, in `rust-toolchain.toml`. rustup fetches it from the
  Rust project's own distribution and checks each component against the
  channel manifest it fetched beside it.
- License: MIT OR Apache-2.0.

### cargo-deny

- Does: checks every crate in the lockfile against `deny.toml`: licenses,
  sources, advisories, and duplicate versions. `make check` runs it, so
  the gate fails on a dependency the policy does not allow.
- Why not our own: the advisory database, the license expression parser,
  and the source policy are three separate problems. All three are
  finished.
- Maintenance: Embark Studios, current, releases every few weeks.
- Pin: 0.20.2, exact. CI installs that version and nothing else, so a
  runner's gate does not move under a pull request that did not touch it.
- License: MIT OR Apache-2.0.

### actionlint

- Does: parses the workflow files and checks them — expression syntax and
  types, runner labels, action inputs, and the shell in every `run`
  block. It calls shellcheck on those run blocks when shellcheck is on
  PATH, which is why the lint job installs both.
- Why not our own: the checks are a model of the workflow schema and the
  expression language, and GitHub changes both without notice.
- Maintenance: rhysd, current, releases every few months.
- Pin: 1.7.12, exact. The job downloads
  `actionlint_1.7.12_linux_amd64.tar.gz` and verifies its SHA256,
  `8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8`,
  which is the digest the release's checksum file publishes.
- License: MIT.

### zizmor

- Does: audits the workflows for what a schema check cannot see — an
  unpinned action, credentials left behind by a checkout, permissions
  wider than a job needs, an expression interpolated into a `run` block.
  Some audits read the referenced repositories, so the job passes it the
  workflow's own token.
- Why not our own: the audit set is a catalogue of known workflow
  attacks, kept current by the people who find them.
- Maintenance: current, releases every few weeks.
- Pin: 1.29.0, exact.
- License: MIT.

### shellcheck

- Does: checks the shell scripts under `.github/scripts/`, and through
  actionlint the shell in every workflow `run` block.
- Why not our own: quoting, word splitting, and exit status have rules
  that are hard to see by reading. The checks encode years of them.
- Maintenance: current, long-lived, widely used.
- Pin: 0.11.0, exact.
- License: GPL-3.0-or-later. It runs on the runner only. Nothing it
  checks links against it.

### luau-analyze

- Does: type checks the Luau snippets on the site against the shipped
  types in `share/types/`. `check-luau-snippets.mjs` spawns it, so it is
  what makes the site's Luau claim true.
- Why not our own: it is the Luau type checker itself, built from the
  same source tree as the virtual machine mlua embeds. A second checker
  would disagree with the one that runs the code.
- Maintenance: the Luau team, releases weekly.
- Pin: 0.734, exact. The release publishes no checksums, so the pin is
  the digest computed from the asset: `luau-macos.zip`, SHA256
  `b76ae047fafc86f82be646af6a2767228c1589437fb38f36959a8ea4bd967cdd`. A
  version bump recomputes it and re-checks the archive's file list.
- License: MIT.

### Node

- Does: runs the site build and every script in the site's check chain.
- Why not our own: it is the runtime every package under `site/` is
  written for.
- Maintenance: the Node.js project, current, on the long term support
  line.
- Pin: 22.23.2, exact. The verb gate reads a TypeScript data module
  directly, which Node does from 22.18 on. An exact pin names the version
  the gate ran against instead of floating inside a major line.
- License: MIT for Node itself; its LICENSE file carries the bundled
  components' own grants beside it.

### pnpm

- Does: installs and runs the site's packages. Corepack fetches it at the
  version `site/package.json` names and verifies it against the integrity
  hash recorded beside the version.
- Why not our own: it is the package manager the site's lockfile is
  written for, and the lockfile pins every package by content hash.
- Maintenance: the pnpm team, current, frequent releases.
- Pin: 11.21.0, exact, with its sha512 integrity hash in the
  `packageManager` field. CI asserts the resolved version before the site
  gate runs.
- License: MIT.

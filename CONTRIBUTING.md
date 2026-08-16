# Contributing to niwa

niwa changes macOS state, so every contribution must preserve its safety contract. This guide explains how to report a problem, propose behavior, and prepare a pull request.

## Open an actionable issue

Search the [open issues](https://github.com/saru-id/niwa/issues) before creating one. Use the matching issue form and include enough detail for another person to reproduce the problem or evaluate the proposal.

- Report unexpected behavior with a minimal config, exact commands, and complete output
- Propose features by describing the problem before the implementation
- Report unclear or incorrect documentation with the affected page or section
- Report vulnerabilities through the [private security form](https://github.com/saru-id/niwa/security/advisories/new)

Never include credentials, private configuration, or identifying machine data. Replace sensitive values while preserving the shape needed to reproduce the problem.

## Agree on behavior before implementation

Open an issue before implementing a new feature or changing niwa's observable behavior. niwa follows a separate design specification, so a plausible implementation may still conflict with the intended contract.

Small documentation fixes, test improvements, and narrow bug fixes can go directly to a pull request. Link an issue when one exists.

## Prepare the development environment

Development requires macOS, the Xcode Command Line Tools, and [Rustup](https://rustup.rs/). The repository selects its Rust version through `rust-toolchain.toml`.

Install the two Cargo tools used by the repository gates:

```shell
cargo install cargo-deny cargo-llvm-cov
```

The site gate also runs `luau-analyze` and fails when the tool is missing. Install it with Homebrew:

```shell
brew install luau
```

Clone and build niwa:

```shell
git clone https://github.com/saru-id/niwa.git
cd niwa
cargo build
```

The documentation site uses the pnpm version declared in `site/package.json`. Enable Corepack before running site commands.

## Run the gates

Run the fast gate before every commit:

```shell
make check
```

Run the full gate before marking a pull request ready:

```shell
make verify
```

The site gate reads more than `site/`. Run it when a change touches `site/`, `src/`, `Cargo.toml`, `tests/`, `share/`, or `install.sh`:

```shell
make site-check
```

Continuous integration (CI) runs `make check` and `make site-check` on every pull request. A failed gate blocks review. Running the gates locally first finds the failure sooner.

Read [the testing guide](docs/testing.md) before adding a new test tier or changing a test boundary. Tests must never touch the real home directory, preferences, services, or package managers.

## Write the change

- Keep each pull request focused on one problem
- Add tests for behavior changes and regressions
- Update snapshots when user-visible output changes
- Update the documentation when the public contract changes
- Add new dependencies to `docs/dependencies.md` before the manifest, and new GitHub Actions or CI-installed tools before the workflows that use them
- Use a Conventional Commit subject such as `fix: protect edited files`

All user-visible text must use the existing output layer. Errors must explain the attempted action, the failure, the next step, and the machine's resulting state.

## Understand what you submit

You must understand every submitted change and be able to explain its behavior, failure modes, and tests. Artificial intelligence tools are allowed, but they do not transfer responsibility away from the author.

Disclose material artificial intelligence assistance in the pull request. Name the tool and describe which parts it helped produce or review.

## Open the pull request

Complete the pull request template. Describe the user-visible effect, link the accepted issue when required, and list the validation you ran.

Maintainers may ask for a smaller change, more evidence, or a different design. A clear issue and a focused diff give the pull request the best chance of review.

# The two gates (see AGENTS.md).
# `check` runs before every commit.
# `verify` runs before any work is called finished.

.PHONY: check fmt clippy test verify coverage

check: fmt clippy test

fmt:
	cargo fmt --all --check

clippy:
	cargo clippy --all-targets -- -D warnings

test:
	cargo test

verify: check coverage

coverage:
	cargo llvm-cov --all-targets

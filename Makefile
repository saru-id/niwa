# The two gates (see AGENTS.md).
# `check` runs before every commit.
# `verify` runs before any work is called finished.

.PHONY: check fmt clippy test deny verify coverage

check: fmt clippy test deny

fmt:
	cargo fmt --all --check

clippy:
	cargo clippy --all-targets -- -D warnings

test:
	cargo test

deny:
	cargo deny check

verify: check coverage

coverage:
	cargo llvm-cov --all-targets

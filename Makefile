# The two gates (see AGENTS.md).
# `check` runs before every commit.
# `verify` runs before any work is called finished.

.PHONY: check fmt clippy test deny verify drills coverage

check: fmt clippy test deny

fmt:
	cargo fmt --all --check

clippy:
	cargo clippy --all-targets -- -D warnings

test:
	cargo test

deny:
	cargo deny check

verify: check drills coverage

drills:
	cargo build
	@for drill in drills/[0-9]*.sh; do \
		NIWA_BIN="$(CURDIR)/target/debug/niwa" sh "$$drill" || exit 1; \
	done

coverage:
	cargo llvm-cov --all-targets

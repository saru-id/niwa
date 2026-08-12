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

verify: check coverage

drills:
	cargo build
	@for drill in drills/[0-9]*.sh; do \
		NIWA_BIN="$(CURDIR)/target/debug/niwa" sh "$$drill" || exit 1; \
	done

# Coverage merges both testing tiers: the cargo tests and the drills,
# all driving one instrumented binary. Drills carry most of the verb
# coverage, so a report without them reads falsely thin.
coverage:
	@sh -c 'eval "$$(cargo llvm-cov show-env --export-prefix)" && \
		cargo llvm-cov clean --workspace && \
		cargo test && \
		cargo build && \
		for drill in drills/[0-9]*.sh; do \
			NIWA_BIN="$$CARGO_LLVM_COV_TARGET_DIR/debug/niwa" sh "$$drill" || exit 1; \
		done && \
		cargo llvm-cov report'

--!strict
-- Everyday CLI tools. One list, and at apply time one brew invocation:
-- same-provider declarations batch until a result is read.
local niwa = require("@niwa")

niwa.brew.formula {
  "fd", "ripgrep", "jq", "fzf",
  "bat", "eza", "zoxide",
  "gh", "hyperfine", "watchexec",
  "bun",
}

-- Nice to have, not worth halting an apply over: a failure records
-- `failed = true` on the result and the run continues.
niwa.brew.formula { name = "btop", optional = true }

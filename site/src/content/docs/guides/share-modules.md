---
title: Share a module
description: Publish a module other people can require, pull one in with niwa.use, and read the lock entry that pins it by hash.
next:
  - href: /start/second-machine
    label: Set up a second machine
    why: a shared module reaches a new Mac the same way the rest of your config does
---

## When to use this

Share a module when the same declarations belong on machines that do not
share a config repo: yours and a colleague's, or one repo per team.
Inside a single repo you need none of this. A module is a file, and your
own sugar is a function.

## What must already be true

- The module lives in a GitHub repository. `github:` is the one source
  `niwa.use` reads.
- You pin a ref. A source without one is refused, and the refusal names
  the pinned form to write instead.
- `niwa update` has resolved it. A plan never fetches.

## Publish a module

A shared module is one file: `init.luau` at the repository root. niwa
loads that file and nothing else, so a second file of your own does not
resolve, and `@self/` names the config repo that used the module rather
than the module. A shared module ships declarations, not files.

```luau
--!strict
-- Rust, the way this team sets it up. One file, one job.
local niwa = require("@niwa")

niwa.brew.formula { "cargo-nextest", "cargo-watch" }

local rustup = niwa.brew.formula("rustup-init")
if rustup.changed then
  niwa.run("rustup-init -y --no-modify-path", { creates = "~/.cargo/bin/rustc" })
end
```

The module calls the same API a config calls, through the same
`require("@niwa")`. There is no module format to learn.

Tag the commit people should pin, and push the tag.

```shell
git tag v1
git push origin v1
```

## Pull one in

One line names the source and the ref.

```luau
niwa.use("github:you/niwa-rust@v1")
```

Then resolve it. `niwa update` clones the ref, records the commit, hashes
the tree, and caches it under that hash. On a machine that has the lock
but not the cache, a run stops and says to run `niwa update` there too.

```shell
niwa update niwa-rust
```

A bare name filters to pins whose name contains it, so one module
re-resolves without moving the rest. [`niwa update`](/reference/cli/update)
covers the verb in full.

## The lock entry

`niwa update` writes one table per module, and the file is committed.

```toml
[use."github:you/niwa-rust"]
ref    = "v1"
commit = "e5b19d7"
sha256 = "41ac03bd8f2e6c5a9d7b1e0f3c2a5d8e7f6b9c0a1d2e3f4a5b6c7d8e9f0a1b2c"
```

The key drops the ref, because the ref is a field and a ref can move. The
`sha256` is a digest over every file in the tree, sorted, with `.git` left
out, and it is also the cache directory's name under
`~/.local/share/niwa/modules/`. Two machines reading one lock read the
same bytes, whatever the tag points at today.

## What the sandbox promises

A module declares. Only niwa acts, and only through the same API your own
config uses, so everything a module would do has a plan line. Its
declarations carry the module's own source location rather than yours, so
`niwa plan` and `niwa explain` say where a line came from.

Read the plan before you trust it. That is the check, and it is available
before the first apply.

The plan is a reporting boundary, not a permission boundary. Your config
is code and the repo is the trust boundary: whoever can move the tag you
pinned can change your machines at your next `niwa update`. The lock is
what keeps that a decision with a diff.

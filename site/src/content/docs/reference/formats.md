---
title: File formats
description: The exact shape of niwa.lock, journal.json, the per-machine stamp, and .luaurc, with what you may rely on in each.
next:
  - href: /reference/files
    label: File locations
    why: it says where each of these files sits and which are committed
  - href: /reference/cli/machines
    label: machines
    why: it reads the fleet from the stamps described here
---

Four files carry a shape worth stating: two committed, one internal, one Luau's.

## niwa.lock

TOML, in the config repo, committed. niwa writes the two-line header itself.

```toml
# Written by niwa, committed on purpose: machine two resolves to the
# same versions this machine did. Edit by running `niwa update <name>`.
niwa = "0.1.1"

[github_release."jesseduffield/lazygit"]
version = "0.44.1"
sha256 = "9f2c7e1ab44c1d5f0d1f5f7c3f2e9a41b8a06d7c4a5b9e3d2c1f0a9b8c7d6e5f"

[mise.node]
version = "22.11.0"

[use."github:stefan/niwa-rust"]
ref = "v1"
commit = "e5b19d7"
sha256 = "41ac03bd8f2e6c5a9d7b1e0f3c2a5d8e7f6b9c0a1d2e3f4a5b6c7d8e9f0a1b2c"
```

| Key | Names | Fields |
| --- | --- | --- |
| `niwa` | — | the version that last wrote the file; a newer one is refused |
| `[github_release."<owner>/<repo>"]` | one release pin | `version`, `sha256` |
| `[mise.<tool>]` | one toolchain | `version` |
| `[use."<source>"]` | one shared module | `ref`, `commit`, `sha256` |

An empty table is left out, so a fresh repo holds the header alone, and a
missing file reads as an empty lock. The lock covers releases fetched by tag,
toolchains through mise, and shared modules by hash, and not Homebrew, which
installs whatever the formula says today. `niwa update` re-resolves and shows
the diff before writing.

## journal.json

JSON, in the state directory, never committed. It is written to a temporary file
and synced before the rename: it is the one ledger a power loss must not empty.

```json
{
  "schema": 1,
  "acknowledged": {
    "file:~/.zshrc": {
      "spec": { "Str": "~/.zshrc" },
      "bytes": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "applied": "2026-08-12T09:41:07Z",
      "config": "a91f3c2"
    }
  },
  "applies": [
    { "id": 7, "when": "2026-08-12T09:41:07Z", "steps": [
      { "identity": "brew.formula:jq", "effect": "PackageInstalled" },
      { "identity": "file:~/.zshrc", "effect": { "FileWritten": { "previous": null } } }
    ] }
  ],
  "declined": ["defaults:com.apple.dock:tilesize"]
}
```

`schema` is the version, `1` today. `acknowledged` maps an identity to what the
last apply made true, and an entry may also carry `context`, the world a
checklist tick was made in. `applies` holds one entry per apply that changed
something, oldest first. `declined` holds the proposals answered "never".

Every value is tagged by its type, so a string reads as `{ "Str": "…" }` and a
table as `{ "Map": { … } }`. An effect with fields is a one-key object; an effect
with none is the bare name, and `"previous": null` means nothing was there.

| Effect | Carries |
| --- | --- |
| `FileWritten` | `previous`, the digest of the archived bytes, and `previous_mode` |
| `LinkMade`, `ServiceSet` | `previous`, the digest of the archived bytes |
| `DefaultsSet` | `previous`, the value the key held |
| `BinaryInstalled` | `path`, `previous` |
| `Irreversible` | `what`, so undo can name what it will not take back |
| `PackageInstalled`, `BrewServiceStarted` | nothing |

This file is internal. Rely on the `schema` number and on the refusal: a schema
change ships with its migration in the same release, and a newer journal is
refused with the way out named. Everything inside an entry may move under it.

## state/&lt;machine&gt;.toml

TOML, in the config repo, committed. One file per machine, rewritten after every
apply, and the file's stem is the machine's name.

```toml
machine_id = "9E1C6A2F-4B7D-4E0A-9C3B-D2F8A1E64C05"
name = "airborne"
applied = "2026-08-12T09:41:07Z"
config = "a91f3c2"
niwa = "0.1.1"
resources = 214
tags = ["work"]
```

Fields appear in that order. `machine_id` is the hardware UUID, or a fallback
identifier when the platform will not give one. `applied` is RFC 3339 to the
second, and `config` the repo's short commit, absent outside a git repository.
`dirty` sits between `config` and `niwa` and appears only when true; `tags` only
when there are tags. `niwa` is the version that wrote the stamp.

## .luaurc

JSON, in the config repo, committed. `niwa init` writes it once and nothing
rewrites it. `luau-lsp` and `luau-analyze` read it, and niwa reads the same
aliases, so `@self` means one thing in both.

```json
{
  "languageMode": "strict",
  "aliases": { "niwa": "~/.local/share/niwa/types", "self": "." }
}
```

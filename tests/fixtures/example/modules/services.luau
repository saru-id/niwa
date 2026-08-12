--!strict
-- Launchd agents as declarations. The plist is owned like a file, so
-- drift inside it is drift like any other.
local niwa = require("@niwa")

-- The programs the agents run: a directory source, one file resource
-- per script, so drift and pull stay per file.
niwa.file("~/.local/bin/", { source = "@self/files/bin/" })

-- Brew managed daemons. Declaring the service implies the formula.
niwa.brew.service { "postgresql@16", "redis" }

niwa.service {
  label    = "dev.stefan.notes-sync",
  program  = { "~/.local/bin/notes-sync", "--quiet" },
  interval = "15m",
  logs     = "~/.local/state/notes-sync/",
}

niwa.service {
  label    = "dev.stefan.repo-backup",
  program  = { "~/.local/bin/repo-backup" },
  calendar = { hour = 3 },
  logs     = "~/.local/state/repo-backup/",
}

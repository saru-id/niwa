--!strict
-- The personal laptop. Loaded last: later declaration wins, merged per key.
local niwa = require("@niwa")

niwa.hostname "airborne"

niwa.brew.cask { "steam", "spotify" }

niwa.dock { autohide = false } -- this machine keeps its dock

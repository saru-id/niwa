--!strict
-- The work machine, tagged `work` (niwa tag work), so apps.luau
-- already added Slack and Linear before this file loads.
local niwa = require("@niwa")

niwa.hostname "workhorse"

-- Same identity as niwa.dock's tilesize: sugar and the generic form lower
-- to one key, so this is an override, not a conflict.
niwa.defaults("com.apple.dock", { tilesize = 40 }) -- smaller external display

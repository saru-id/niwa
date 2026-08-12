--!strict
-- Staging: accepted proposals land here when no other module matches.
-- Unsorted and working beats blocked on tidying. Move lines out whenever
-- you feel like it, or never.
local niwa = require("@niwa")

-- proposed 2026-08-09 · flipped in System Settings, accepted
niwa.defaults("com.apple.symbolichotkeys", {
  ["AppleSymbolicHotKeys.64.enabled"] = false, -- cmd-space belongs to Raycast now
})

-- proposed 2026-08-11 · installed by hand; brew lives in three modules,
-- so the match was ambiguous and the proposal landed here
niwa.brew.formula { "htop" }

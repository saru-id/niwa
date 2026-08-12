--!strict
-- GUI apps and fonts. Casks cover both.
local niwa = require("@niwa")

niwa.brew.cask {
  "ghostty", "raycast", "orbstack", "zed",
  "font-jetbrains-mono", "font-atkinson-hyperlegible",
}

-- App Store installs need a signed-in account; sign-in itself is a
-- checklist item, never a hang.
niwa.mas.app { ["Things 3"] = 904280696 }

-- TCC grants cannot be automated and niwa does not pretend: this is a
-- checklist entry with a deep link into the exact settings pane.
niwa.permission { app = "Ghostty", needs = "accessibility" }

-- The checklist is extendable: steps only a human can do live in the
-- config too, acknowledged once per machine.
niwa.brew.cask { "tailscale" }
niwa.manual { "Sign in to Tailscale", open = "https://login.tailscale.com" }

if niwa.machine.tags.work then
  niwa.brew.cask { "slack", "linear-linear" }
end

--!strict
-- Dock, Finder, and the desktop itself.
local niwa = require("@niwa")

niwa.dock {
  autohide = true,
  tilesize = 48,
  apps = {},                 -- yes: an empty dock, on every machine
  minimize_effect = "scale", -- "genie" | "scale" | "suck"
}

niwa.finder {
  show_hidden   = true,
  default_view  = "list",
  path_in_title = true,
}

-- No sugar for WindowManager yet; the generic form is the same one-liner.
niwa.defaults("com.apple.WindowManager", {
  StandardHideWidgets = true,
  EnableStandardClickToShowDesktop = false,
}, { restart = "Dock" })

niwa.defaults("com.apple.screencapture", {
  location = `{niwa.home}/Pictures`,
  ["disable-shadow"] = true,
}, { restart = "SystemUIServer" })

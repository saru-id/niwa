--!strict
-- The keyboard is the product. Nothing here needs admin except the
-- /Library half, which the plan calls out before asking once.
local niwa = require("@niwa")

niwa.defaults("NSGlobalDomain", {
  KeyRepeat = 2,
  InitialKeyRepeat = 15,
  ApplePressAndHoldEnabled = false,      -- hold for repeat, not accents
  NSAutomaticCapitalizationEnabled = false,
  ["com.apple.trackpad.scaling"] = 2.5,
})

niwa.defaults("com.apple.AppleMultitouchTrackpad", {
  Clicking = true,                       -- tap to click
})

-- The admin half. One password prompt, at the top of the apply.
niwa.defaults("/Library/Preferences/com.apple.alf", { globalstate = 1 })
niwa.defaults("/Library/Preferences/com.apple.loginwindow", {
  GuestEnabled = false,
})

if niwa.machine.arch == "arm64" then
  niwa.run("softwareupdate --install-rosetta --agree-to-license", {
    unless = niwa.exists("/Library/Apple/usr/share/rosetta"),
    privileged = true,
  })
end

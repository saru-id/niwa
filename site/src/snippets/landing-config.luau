--!strict
local niwa = require("@niwa")

niwa.brew.formula { "git", "jq", "ripgrep" }
niwa.brew.cask { "firefox", "visual-studio-code" }

niwa.dock { autohide = true, tilesize = 48 }
niwa.finder { show_hidden = true, default_view = "list" }

niwa.file("~/.zshrc", { source = "@self/files/zshrc" })

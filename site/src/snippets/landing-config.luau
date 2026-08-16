--!strict
local niwa = require("@niwa")

niwa.brew.formula { "fd", "ripgrep", "jq" }

niwa.dock {
  autohide = true,
  tilesize = 48,
}

niwa.file("~/.zshrc", { source = "@self/files/zshrc" })

local nvim = niwa.brew.formula "neovim"
local cfg  = niwa.link("~/.config/nvim", { to = "@self/files/nvim" })
if nvim.changed or cfg.changed then
  niwa.run("nvim --headless '+Lazy! sync' +qa", { timeout = "5m" })
end

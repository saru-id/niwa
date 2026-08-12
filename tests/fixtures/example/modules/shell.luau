--!strict
-- Shell and terminal. Files are copied, not symlinked; edits made on the
-- live side come home with `niwa pull`.
local niwa = require("@niwa")

niwa.brew.formula { "starship", "zsh" }

-- Brewed zsh over the system one: /etc/shells entry + chsh, one line.
niwa.login_shell "/opt/homebrew/bin/zsh"

niwa.file("~/.zshrc",                 { source = "@self/files/zshrc" })
niwa.file("~/.config/starship.toml",  { source = "@self/files/starship.toml" })
niwa.file("~/.config/ghostty/config", { source = "@self/files/ghostty.conf" })

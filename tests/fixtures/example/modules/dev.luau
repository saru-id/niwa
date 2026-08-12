--!strict
-- Toolchains, editors, and the one custom resource this repo defines.
local niwa = require("@niwa")

niwa.mise.tool { node = "lts", rust = "stable" } -- pinned in niwa.lock
niwa.npm.global { "@biomejs/biome" }

niwa.github_release { repo = "jesseduffield/lazygit", bin = "lazygit" }

-- Local dev domain. /etc/hosts is shared, so entries are per line
-- declarations with their own identity, never whole file ownership.
niwa.hosts { ["flagmingo.test"] = "127.0.0.1" }

-- Neovim: the formula, the config, and a plugin sync that runs only
-- when either of them actually moved.
local nvim = niwa.brew.formula "neovim"
local cfg  = niwa.link("~/.config/nvim", { to = "@self/files/nvim" })

if nvim.changed or cfg.changed then
  niwa.run("nvim --headless '+Lazy! sync' +qa", { timeout = "5m" })
end

-- Secrets resolve at apply time (Keychain first, then secrets/*.age),
-- never into the repo. The diff and the journal will show `••••`.
local token = niwa.secret("github-token")

niwa.file("~/.netrc", {
  content = niwa.render("machine api.github.com login {user} password {token}",
                      { user = "stefan", token = token }),
  mode = "600",
})

-- Genuinely not idempotent, so it runs exactly once and the journal
-- keeps the marker. Recorded as irreversible; `undo` will say so.
niwa.once("generate-ssh-key", function()
  niwa.run(`ssh-keygen -t ed25519 -N "" -f {niwa.home}/.ssh/id_ed25519`)
end)

-- A resource kind niwa does not ship, defined in fifteen lines.
-- `check` gets a read-only handle; `reverse` makes it a citizen of `undo`.
local rustup_component = niwa.resource("rustup.component", {
  check = function(read, spec: { name: string }): boolean
    return read.exec("rustup component list --installed").stdout
      :find(spec.name, 1, true) ~= nil
  end,
  apply = function(act, spec)
    act.exec(`rustup component add {spec.name}`)
  end,
  reverse = function(act, spec)
    act.exec(`rustup component remove {spec.name}`)
  end,
  describe = function(spec)
    return `rustup component {spec.name}`
  end,
})

rustup_component { name = "rust-analyzer" }

-- A module someone else published: sandboxed exactly like the code above,
-- pinned by hash in niwa.lock, and `plan` shows its work before you trust it.
niwa.use("github:stefan/niwa-rust@v1")

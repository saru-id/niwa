--!strict
-- Every call shape the documentation shows, in one file.
--
-- The types suite runs the Luau analyzer over this under the same
-- strict alias arrangement `niwa init` writes, so a shipped type that
-- rejects a documented call fails the suite instead of a reader. It is
-- read, never run: the analyzer is the only program that opens it.
local niwa = require("@niwa")

-- Packages: a name, a list of names, and the options table.
niwa.brew.formula("jq")
niwa.brew.formula "neovim"
niwa.brew.formula { "fd", "ripgrep", "jq" }
niwa.brew.formula { name = "pandoc", optional = true }
niwa.brew.cask("ghostty")
niwa.brew.cask { "rectangle", "raycast" }
niwa.brew.cask { name = "docker", optional = true }
niwa.npm.global("@biomejs/biome")
niwa.npm.global { "@biomejs/biome" }
niwa.npm.global { name = "typescript", optional = true }
niwa.mas.app { ["Things 3"] = 904280696 }
niwa.mise.tool { node = "lts", rust = "stable" }
niwa.github_release { repo = "jqlang/jq" }
niwa.github_release { repo = "jesseduffield/lazygit", bin = "lazygit" }

-- The annotations are the assertion: a name gives one result, a list
-- gives a list of them. The options form gives one result as well, but
-- this analyzer resolves every table literal to the list signature, so
-- reading a field off that form is not checkable here.
local one = niwa.brew.formula("bat")
local many = niwa.brew.formula { "eza", "zoxide" }
local version: string? = one.version
local present: boolean = many[1].present
niwa.brew.formula { name = "ffmpeg", optional = true }

-- Files and links.
niwa.file("~/.zshrc", { source = "@self/files/zshrc" })
niwa.file("~/.hushlogin", { content = "" })
niwa.file("~/.ssh/config", { source = "@self/files/ssh_config", mode = "600" })
niwa.link("~/.config/nvim", { to = "@self/files/nvim" })

-- Secrets: a name, the options table, and the options table with the
-- provider forced. Rendering takes plain values and secrets alike.
local plain = niwa.secret("github-token")
local named = niwa.secret { name = "npm-token" }
local forced = niwa.secret { name = "work-token", from = "keychain" }

niwa.file("~/.netrc", {
  content = niwa.render("machine api.github.com login {user} password {token}", {
    user = "stefan",
    token = plain,
  }),
  mode = "600",
})
niwa.file("~/.npmrc", {
  content = niwa.render("//registry.npmjs.org/:_authToken={token}", { token = named }),
  mode = "600",
})
niwa.file("~/.work-token", {
  content = niwa.render("{token} on port {port}", { token = forced, port = 443 }),
  mode = "600",
})

-- System settings, generic and sugared.
niwa.defaults("com.apple.WindowManager", { StandardHideWidgets = true })
niwa.defaults("com.apple.dock", {
  autohide = true,
  tilesize = 48,
  ["wvous-bl-corner"] = 1,
}, { restart = "Dock" })
niwa.dock { autohide = true, tilesize = 48, apps = {}, minimize_effect = "scale" }
niwa.finder { show_hidden = true, default_view = "list", path_in_title = true }
niwa.hosts { ["flagmingo.test"] = "127.0.0.1" }
niwa.login_shell "/opt/homebrew/bin/zsh"
niwa.hostname("airborne")

-- Services: brew's, and launchd agents with each of the three
-- schedules.
niwa.brew.service("redis")
niwa.brew.service { "postgresql@16", "redis" }

niwa.service {
  label    = "dev.stefan.notes-sync",
  program  = { "~/.local/bin/notes-sync", "--quiet" },
  interval = "15m",
  logs     = "~/.local/state/notes-sync/",
}
niwa.service {
  label    = "dev.stefan.repo-backup",
  program  = { "~/.local/bin/repo-backup" },
  calendar = { minute = 30, hour = 3, day = 1, weekday = 0 },
}
niwa.service {
  label     = "dev.stefan.watcher",
  program   = { "~/.local/bin/watcher" },
  keepalive = true,
}

-- The escape hatch, with each guard the design names.
niwa.run("nvim --headless '+Lazy! sync' +qa", {
  unless = niwa.exists("~/.local/share/nvim/lazy"),
  timeout = "5m",
})
niwa.run("softwareupdate --install --all", {
  only_if = niwa.command("softwareupdate"),
  privileged = true,
})
niwa.run("mkdir -p ~/.cache/niwa", { creates = "~/.cache/niwa", optional = true })

-- Reading a result is a barrier, and it also arms the guard context:
-- past the first read the branch is the guard.
if one.changed or present or version ~= nil then
  niwa.run("nvim --headless '+Lazy! sync' +qa", { timeout = "5m" })
end

niwa.once("generate-ssh-key", function()
  niwa.run(`ssh-keygen -t ed25519 -N "" -f {niwa.home}/.ssh/id_ed25519`)
end)

niwa.try(function()
  niwa.brew.formula "ffmpeg"
end)

-- The checklist: work only a person can do.
niwa.permission { app = "Ghostty", needs = "Full Disk Access" }
niwa.manual {
  "Sign in to the App Store",
  open = "x-apple.systempreferences:com.apple.systempreferences.AppleIDSettings",
}
niwa.manual { "Authorize the token", command = "gh auth login" }

-- A resource kind of your own, reversible and not.
local dotnet_tool = niwa.resource("dotnet.tool", {
  check = function(read, spec: { name: string }): boolean
    return read.exec(`dotnet tool list --global`).stdout:find(spec.name, 1, true) ~= nil
  end,
  apply = function(act, spec)
    act.exec(`dotnet tool install --global {spec.name}`)
  end,
  reverse = function(act, spec)
    act.exec(`dotnet tool uninstall --global {spec.name}`)
  end,
  describe = function(spec)
    return `dotnet tool {spec.name}`
  end,
})

dotnet_tool { name = "dotnet-ef" }

local seeded = niwa.resource("db.seeded", {
  check = function(read, spec: { database: string }): boolean
    return read.exec(`psql -lqt`).stdout:find(spec.database, 1, true) ~= nil
  end,
  apply = function(act, spec)
    act.exec(`createdb {spec.database}`)
  end,
  reverse = false,
  describe = function(spec)
    return `database {spec.database}`
  end,
  privileged = true,
})

seeded { database = "flagmingo" }

-- Sugar you write is a function, and results pass through it.
local function tool(name: string, config: string?)
  local package = niwa.brew.formula(name)
  if config then
    niwa.file(`~/.config/{name}/{config}`, { source = `@self/files/{config}` })
  end
  return package
end

tool("starship", "starship.toml")
tool("btop")

-- A shared module, and the facts a config reads about its machine.
niwa.use("github:stefan/niwa-rust@v1")

local machine: string = niwa.machine.name
local owner: string = niwa.machine.owner
local arch: string = niwa.machine.arch
local os: string = niwa.machine.os
local work: boolean? = niwa.machine.tags.work
local prefix: string = niwa.brew.prefix
local home: string = niwa.home

if work == true and arch ~= "" and os ~= "" and owner ~= "" and machine ~= "" then
  niwa.manual { `Check the work VPN profile in {home}, Homebrew is at {prefix}` }
end

-- The host file is the override, so it loads last.
niwa.host()

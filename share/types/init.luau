--!strict
-- Type definitions for the niwa config API.
--
-- niwa installs this file to ~/.local/share/niwa/types, and the
-- generated .luaurc aliases `@niwa` to that directory, so
-- `require("@niwa")` autocompletes and type-checks in any editor
-- running luau-lsp. niwa itself never executes this file; the real
-- API lives inside the niwa binary.

-- Every resource returns a frozen result. `failed` is only ever true
-- under `optional = true`.
export type Result = {
	changed: boolean,
	present: boolean,
	version: string?,
	failed: boolean?,
}

-- Everything a preference plist can say.
export type Plist = boolean | number | string | { Plist } | { [string]: Plist }

-- An opaque secret handle. Resolves at apply time, never at plan
-- time, and never into the config.
export type Secret = {
	name: string,
}

-- An opaque rendered template, for `content =`. The plan shows its
-- shape; secret values stay masked everywhere.
export type Rendered = {
	template: string,
}

-- The read-only handle a custom resource's `check` receives.
export type ReadHandle = {
	exec: (command: string) -> { stdout: string, code: number },
}

-- The acting handle `apply` and `reverse` receive.
export type ActHandle = {
	exec: (command: string) -> (),
}

-- The analyzer does not pick between overloads by a table literal's
-- fields, so shapes that share a return type share one signature and a
-- union names them. Only the list form returns a list, so only it
-- stands apart.
type PackageFn =
	((name: string | { name: string, optional: boolean? }) -> Result)
	& ((names: { string }) -> { Result })

type ServiceFn = (name: string | { string }) -> Result

export type Niwa = {
	-- Homebrew, read through receipts, never `brew list`.
	brew: {
		formula: PackageFn,
		cask: PackageFn,
		-- Declaring the service implies the formula.
		service: ServiceFn,
		-- "/opt/homebrew" on Apple silicon.
		prefix: string,
	},

	-- App Store apps; declared and counted, not yet checkable in this build.
	mas: {
		app: (apps: { [string]: number }) -> Result,
	},

	npm: {
		global: PackageFn,
	},

	-- Versions pin in niwa.lock.
	mise: {
		tool: (tools: { [string]: string }) -> Result,
	},

	-- Version and hash pin in niwa.lock.
	github_release: (options: { repo: string, bin: string? }) -> Result,

	-- Copied, never symlinked; `pull` brings live edits home. A
	-- directory source fans out to one resource per file. `mode` is a
	-- string of octal digits, for example "600".
	file: (target: string, options: {
		source: string?,
		content: (string | Rendered)?,
		mode: string?,
	}) -> Result,

	-- A symlink, for directories you develop in.
	link: (target: string, options: { to: string }) -> Result,

	-- Any preference domain, user or /Library.
	defaults: (domain: string, values: { [string]: Plist }, options: { restart: string? }?) -> Result,

	dock: (settings: {
		autohide: boolean?,
		tilesize: number?,
		apps: { string }?,
		minimize_effect: ("genie" | "scale" | "suck")?,
	}) -> Result,

	finder: (settings: {
		show_hidden: boolean?,
		default_view: ("list" | "icon" | "column" | "gallery")?,
		path_in_title: boolean?,
	}) -> Result,

	-- Per-entry declarations; the store is /etc/hosts.
	hosts: (entries: { [string]: string }) -> Result,

	-- /etc/shells entry plus chsh. Needs administrator rights.
	login_shell: (path: string) -> Result,

	-- Needs administrator rights.
	hostname: (name: string) -> Result,

	-- A launchd agent. Exactly one schedule: interval, calendar, or
	-- keepalive.
	service: (options: {
		label: string,
		program: { string },
		interval: string?,
		calendar: { minute: number?, hour: number?, day: number?, weekday: number? }?,
		keepalive: boolean?,
		logs: string?,
	}) -> Result,

	-- The escape hatch. A guard is required: `unless`, `only_if`, or
	-- `creates`.
	run: (command: string, options: {
		unless: boolean?,
		only_if: boolean?,
		creates: string?,
		timeout: string?,
		optional: boolean?,
		privileged: boolean?,
	}?) -> Result,

	-- Runs exactly once per machine; the journal keeps the marker.
	-- Recorded as irreversible.
	once: (name: string, body: () -> ()) -> Result,

	-- Failures inside the block do not halt the apply. The block's own
	-- value does not come back: a contained failure has none.
	try: <T...>(body: () -> T...) -> (),

	-- A checklist entry with a deep link. Never a fake check.
	permission: (options: { app: string, needs: string }) -> Result,

	-- Your own checklist steps. `open` deep links; `command` is shown,
	-- never executed.
	manual: (options: { [number]: string, open: string?, command: string? }) -> Result,

	-- Searches the keychain, then secrets/<name>.age, then an external
	-- manager. Force one with `from`.
	secret: (name: string | { name: string, from: string? }) -> Secret,

	-- String templating with masked secrets: `{name}` placeholders.
	render: (template: string, values: { [string]: string | number | Secret }) -> Rendered,

	-- A shared module, pinned by hash in niwa.lock and sandboxed like
	-- your own code.
	use: (source: string) -> (),

	-- Define a resource kind of your own. `check` is read-only by
	-- construction; `reverse = false` marks the kind irreversible.
	resource: <S>(kind: string, definition: {
		check: (read: ReadHandle, spec: S) -> boolean,
		apply: (act: ActHandle, spec: S) -> (),
		reverse: ((act: ActHandle, spec: S) -> ()) | false,
		describe: (spec: S) -> string,
		privileged: boolean?,
	}) -> (spec: S) -> Result,

	machine: {
		name: string,
		owner: string,
		arch: string,
		os: string,
		tags: { [string]: boolean },
	},

	home: string,

	exists: (path: string) -> boolean,
	command: (name: string) -> boolean,

	-- Loads hosts/<this machine>.luau if it exists.
	host: () -> (),
}

return (nil :: any) :: Niwa

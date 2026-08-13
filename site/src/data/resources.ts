/* The resource calls, as data.
 *
 * Twenty calls over nineteen named kinds, plus the custom kinds
 * `niwa.resource` defines. Signatures and behavior come from
 * `share/types/init.luau`, the file niwa installs for the editor, and are
 * bound to it by the digest in `types-digest.ts`: change the types and the
 * test fails until these entries are read again.
 *
 * Five pages hold them, grouped by what a person is doing. A reader
 * comparing `brew.formula` with `brew.cask` should not have to navigate.
 * Every entry still deep links, for example
 * `/reference/api/packages#brew-cask`.
 */

/** The five resource pages. */
export type GroupId = 'packages' | 'files' | 'settings' | 'services' | 'human'

export interface ApiEntry {
  /** The call as written in a config, for example `niwa.brew.cask`. */
  readonly name: string
  /** One line: the arguments and what comes back. */
  readonly signature: string
  /** What it does and what it costs, in one to three sentences. */
  readonly description: string
}

export interface Resource extends ApiEntry {
  readonly group: GroupId
}

/** The page each group renders on, and the line under its title. */
export const GROUPS: readonly {
  id: GroupId
  path: string
  title: string
  deck: string
}[] = [
  {
    id: 'packages',
    path: '/reference/api/packages',
    title: 'Packages and tools',
    deck: 'Seven calls install software: Homebrew, the App Store, npm, mise, and GitHub releases.',
  },
  {
    id: 'files',
    path: '/reference/api/files',
    title: 'Files and links',
    deck: 'Two calls put files where they belong. One copies, one links, and the difference matters.',
  },
  {
    id: 'settings',
    path: '/reference/api/settings',
    title: 'System settings',
    deck: 'Six calls declare what macOS itself does: preference domains, the Dock, the Finder, and three machine-wide settings.',
  },
  {
    id: 'services',
    path: '/reference/api/services',
    title: 'Services',
    deck: 'Three calls run things: a launchd agent, a guarded command, and a body that runs once.',
  },
  {
    id: 'human',
    path: '/reference/api/human',
    title: 'Manual steps',
    deck: 'Two calls describe work only a person can do. Both are checklist items, never prompts.',
  },
]

/**
 * The anchor a heading carries, and the fragment a link points at.
 * `niwa.brew.cask` becomes `brew-cask`, `niwa.github_release` becomes
 * `github-release`.
 */
export function anchor(name: string): string {
  return name.replace(/^niwa\.?/, '').replaceAll('.', '-').replaceAll('_', '-')
}

export const RESOURCES: readonly Resource[] = [
  {
    group: 'packages',
    name: 'niwa.brew.formula',
    signature:
      'niwa.brew.formula(name: string | { string } | { name: string, optional: boolean? }) -> Result | { Result }',
    description:
      'Install a Homebrew formula. niwa reads the receipts under the Homebrew prefix rather than asking brew, so checking a hundred formulae is a hundred directory reads. Pass a list to declare several at once, or a table with optional = true to let one failure stand without stopping the apply.',
  },
  {
    group: 'packages',
    name: 'niwa.brew.cask',
    signature:
      'niwa.brew.cask(name: string | { string } | { name: string, optional: boolean? }) -> Result | { Result }',
    description:
      'Install a Homebrew cask. The three call shapes and the receipt check are the formula call, applied to applications.',
  },
  {
    group: 'packages',
    name: 'niwa.brew.service',
    signature: 'niwa.brew.service(name: string | { string }) -> Result',
    description:
      'Start and keep a Homebrew service running. Declaring the service implies the formula, so you never write both.',
  },
  {
    group: 'packages',
    name: 'niwa.mas.app',
    signature: 'niwa.mas.app(apps: { [string]: number }) -> Result',
    description:
      'Declare App Store applications, by name and numeric id. This build declares and counts them; it does not check whether they are installed.',
  },
  {
    group: 'packages',
    name: 'niwa.npm.global',
    signature:
      'niwa.npm.global(name: string | { string } | { name: string, optional: boolean? }) -> Result | { Result }',
    description:
      'Install a global npm package. The three call shapes are the ones the Homebrew calls take.',
  },
  {
    group: 'packages',
    name: 'niwa.mise.tool',
    signature: 'niwa.mise.tool(tools: { [string]: string }) -> Result',
    description:
      'Install development tools through mise, each with its version. The versions pin in niwa.lock, so every machine that shares the config installs the same one.',
  },
  {
    group: 'packages',
    name: 'niwa.github_release',
    signature: 'niwa.github_release(options: { repo: string, bin: string? }) -> Result',
    description:
      'Install a binary from a GitHub release. repo is "owner/name". bin is the bare file name to install when it is not the repository name, and it lands in ~/.local/bin. The version and its hash pin in niwa.lock.',
  },
  {
    group: 'files',
    name: 'niwa.file',
    signature:
      'niwa.file(target: string, options: { source: string?, content: (string | Rendered)?, mode: string? }) -> Result',
    description:
      'Put a file at target. niwa copies; it never symlinks, so an edit you make on the machine is yours to keep and pull brings it home. A directory source fans out to one resource per file. mode is a string of octal digits, for example "600".',
  },
  {
    group: 'files',
    name: 'niwa.link',
    signature: 'niwa.link(target: string, options: { to: string }) -> Result',
    description:
      'Make a symlink at target. This is the call for directories you develop in, where a copy would be the wrong thing.',
  },
  {
    group: 'settings',
    name: 'niwa.defaults',
    signature:
      'niwa.defaults(domain: string, values: { [string]: Plist }, options: { restart: string? }?) -> Result',
    description:
      'Set keys in a preference domain, user or /Library. Each key is its own resource, so two modules can declare different keys of one domain and only a real collision is a conflict. restart names the application to restart once the keys change.',
  },
  {
    group: 'settings',
    name: 'niwa.dock',
    signature:
      'niwa.dock(settings: { autohide: boolean?, tilesize: number?, apps: { string }?, minimize_effect: ("genie" | "scale" | "suck")? }) -> Result',
    description:
      'Declare the Dock. It is sugar over defaults for the four settings people change, and it restarts the Dock for you.',
  },
  {
    group: 'settings',
    name: 'niwa.finder',
    signature:
      'niwa.finder(settings: { show_hidden: boolean?, default_view: ("list" | "icon" | "column" | "gallery")?, path_in_title: boolean? }) -> Result',
    description:
      'Declare the Finder. The same sugar as the Dock call, for three settings.',
  },
  {
    group: 'settings',
    name: 'niwa.hosts',
    signature: 'niwa.hosts(entries: { [string]: string }) -> Result',
    description:
      'Declare entries in /etc/hosts. Keys are host names, values are addresses, and each entry is its own resource. Lines you did not declare stay where they are.',
  },
  {
    group: 'settings',
    name: 'niwa.login_shell',
    signature: 'niwa.login_shell(path: string) -> Result',
    description:
      'Set the login shell. It adds the path to /etc/shells and runs chsh, and it needs administrator rights.',
  },
  {
    group: 'settings',
    name: 'niwa.hostname',
    signature: 'niwa.hostname(name: string) -> Result',
    description: "Set the machine's hostname. It needs administrator rights.",
  },
  {
    group: 'services',
    name: 'niwa.service',
    signature:
      'niwa.service(options: { label: string, program: { string }, interval: string?, calendar: { minute: number?, hour: number?, day: number?, weekday: number? }?, keepalive: boolean?, logs: string? }) -> Result',
    description:
      'Declare a launchd agent. Exactly one schedule: interval, calendar, or keepalive. Two is an error, and none is an error.',
  },
  {
    group: 'services',
    name: 'niwa.run',
    signature:
      'niwa.run(command: string, options: { unless: boolean?, only_if: boolean?, creates: string?, timeout: string?, optional: boolean?, privileged: boolean? }?) -> Result',
    description:
      'Run a command. This is the escape hatch, so a guard is required: unless, only_if, or creates. Without one, niwa refuses the config rather than run the command on every apply.',
  },
  {
    group: 'services',
    name: 'niwa.once',
    signature: 'niwa.once(name: string, body: () -> ()) -> Result',
    description:
      'Run a body exactly once on this machine. The journal keeps the marker, and the step is recorded as irreversible: undo will not take it back.',
  },
  {
    group: 'human',
    name: 'niwa.permission',
    signature: 'niwa.permission(options: { app: string, needs: string }) -> Result',
    description:
      'Declare a permission an application needs. It becomes a checklist item with a deep link into System Settings. niwa never fakes the check and never prompts for it.',
  },
  {
    group: 'human',
    name: 'niwa.manual',
    signature:
      'niwa.manual(options: { [number]: string, open: string?, command: string? }) -> Result',
    description:
      'Declare your own checklist steps, as an array of lines. open deep links to the place the work happens; command is shown and never executed.',
  },
]

/** The entries of one page, in declaration order. */
export function resourcesOf(group: GroupId): readonly Resource[] {
  return RESOURCES.filter((resource) => resource.group === group)
}

/** One page's title and deck. Every group has one, so a miss is a typo. */
export function groupOf(id: GroupId): (typeof GROUPS)[number] {
  const found = GROUPS.find((group) => group.id === id)
  if (!found) {
    throw new Error(`No resource group is named "${id}". The site did not build.`)
  }
  return found
}

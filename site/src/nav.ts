/* The site's navigation, declared once.
 *
 * The sidebar renders from this module, and `/llms.txt` enumerates the same
 * entries with the same one-line jobs. Two readers, one source. Every job is
 * the page's own purpose, and for the command pages it is the text the binary
 * itself prints (`src/cli.rs`).
 */

/** One page: a sidebar item, and one line in `/llms.txt`. */
export interface NavEntry {
  readonly path: string
  readonly title: string
  /** What the page is for, in one line. */
  readonly job: string
}

/**
 * One sidebar group. Two levels, no third.
 *
 * No group folds. A fold that a reader with no script cannot open is a page
 * the rail hides, so every group is a section and every section is open.
 */
export interface NavGroup {
  readonly label: string
  readonly entries: readonly NavEntry[]
}

/** The version the footer names once, and the two links beside it. */
export const SITE = {
  /** The crate version in `Cargo.toml`. A test binds them together. */
  version: '0.1.0',
  // The repository's public home. No remote exists today; the address is
  // settled at deploy, and the deploy checklist confirms it.
  repository: 'https://github.com/saru-id/niwa',
  /** The name the header prints beside the mark. A test binds it to the URL. */
  slug: 'saru-id/niwa',
  license: 'https://github.com/saru-id/niwa#license',
  index: '/llms.txt',
} as const

/** The landing sits outside the sidebar. `/llms.txt` still lists it first. */
export const LANDING: NavEntry = {
  path: '/',
  title: 'niwa',
  job: 'State what niwa is, show one real config and one real screen, and route to three places',
}

/*
 * A second documented version would put a version switcher above the first
 * group. There is one version, so there is no switcher.
 */
export const NAV: readonly NavGroup[] = [
  {
    label: 'Start',
    entries: [
      {
        path: '/start',
        title: 'Install',
        job: 'Get the binary on the machine and say what the installer touched',
      },
      {
        path: '/start/first-config',
        title: 'Your first config',
        job: 'Run niwa init, read what it wrote, understand the four files that matter',
      },
      {
        path: '/start/first-apply',
        title: 'Your first apply',
        job: 'Run plan, read the plan, run apply, read what happened',
      },
      {
        path: '/start/adopt',
        title: 'Adopt a machine you already use',
        job: 'Point niwa at a lived-in Mac without losing anything',
      },
      {
        path: '/start/second-machine',
        title: 'Set up a second machine',
        job: 'Clone the config on a new Mac and reach the same state',
      },
    ],
  },
  {
    label: 'Concepts',
    entries: [
      {
        path: '/concepts',
        title: 'Concepts',
        job: 'Say what these pages are for and in what order to read them',
      },
      {
        path: '/concepts/model',
        title: 'Declared, actual, acknowledged',
        job: 'Teach the three states and the four comparisons they produce',
      },
      {
        path: '/concepts/apply',
        title: 'The apply loop',
        job: 'Explain the three phases, the two passes, and the overwrite ladder',
      },
      {
        path: '/concepts/checklist',
        title: 'The checklist and manual steps',
        job: 'Explain why some work is a checklist item and never a prompt',
      },
      {
        path: '/concepts/drift',
        title: 'Drift and the write-back loop',
        job: "Explain proposals, the four answers, and why pull is apply's inverse",
      },
      {
        path: '/concepts/watcher',
        title: 'The watcher',
        job: 'Explain a stateless launchd job whose whole vocabulary is notify',
      },
      {
        path: '/concepts/safety',
        title: 'Safety and undo',
        job: 'Explain the archive rule, the journal, and why there is no world rollback',
      },
      {
        path: '/concepts/secrets',
        title: 'Secrets',
        job: 'Explain typed opaque secrets, resolution order, and the masking rule',
      },
      {
        path: '/concepts/machines',
        title: 'Many machines',
        job: 'Explain the git boundary, the stamp, machine identity, and the lockfile',
      },
      {
        path: '/concepts/config',
        title: 'The config and its modules',
        job: 'Explain structure-from-layout, modules as groups, hosts as override',
      },
      {
        path: '/concepts/luau',
        title: 'The config language',
        job: 'Explain why Luau, the sandbox, and where types are actually enforced',
      },
      {
        path: '/concepts/limits',
        title: 'What niwa will not do',
        job: "State the refusals and the honest limits, in the tool's own words",
      },
    ],
  },
  {
    label: 'Guides',
    entries: [
      {
        path: '/guides',
        title: 'Guides',
        job: 'Route to the task the reader came for',
      },
      {
        path: '/guides/system-settings',
        title: 'Manage system settings',
        job: 'Declare defaults, dock, and finder, and know what restarts',
      },
      {
        path: '/guides/dotfiles',
        title: 'Manage dotfiles',
        job: 'Copy files, link files, render templates, and know which is which',
      },
      {
        path: '/guides/packages',
        title: 'Manage packages',
        job: 'Install formulae, casks, global npm packages, tools, and release binaries',
      },
      {
        path: '/guides/services',
        title: 'Manage services',
        job: 'Declare a launchd agent with exactly one schedule',
      },
      {
        path: '/guides/custom-resource',
        title: 'Write a custom resource',
        job: 'Define a kind with check, apply, reverse, and describe',
      },
      {
        path: '/guides/share-modules',
        title: 'Share a module',
        job: 'Publish a module, pull one in with niwa.use, and read its lock entry',
      },
      {
        path: '/guides/schedule-convergence',
        title: 'Schedule convergence',
        job: 'Declare a service that runs apply --yes on a schedule, and decide whether to',
      },
      {
        path: '/guides/recover',
        title: 'Recover a machine',
        job: 'Rebuild after a failure: restore the sealing key, apply, verify',
      },
      {
        path: '/guides/secrets',
        title: 'Store and use a secret',
        job: 'Add a secret, reference it, render it into a file, escrow the key',
      },
      {
        path: '/guides/capture-a-change',
        title: 'Capture a change you made by hand',
        job: 'Flip something in System Settings and keep it',
      },
    ],
  },
  {
    label: 'Commands',
    entries: [
      {
        path: '/reference/cli/niwa',
        title: 'niwa',
        job: 'The home screen: everything the tool knows, in one screen',
      },
      {
        path: '/reference/cli/check',
        title: 'check',
        job: 'Validate the config: it loads, every spec is well formed, and declarations do not conflict',
      },
      {
        path: '/reference/cli/plan',
        title: 'plan',
        job: 'Show what apply would do. Exit 0 when in sync, 2 when changes are pending, 1 on an error',
      },
      {
        path: '/reference/cli/apply',
        title: 'apply',
        job: 'Make the config true: plan, confirm, execute',
      },
      {
        path: '/reference/cli/undo',
        title: 'undo',
        job: 'Reverse the most recent apply',
      },
      {
        path: '/reference/cli/pull',
        title: 'pull',
        job: 'Bring machine-side changes home to the config: the inverse of apply',
      },
      {
        path: '/reference/cli/add',
        title: 'add',
        job: 'Install something and write its config line, in one motion',
      },
      {
        path: '/reference/cli/fmt',
        title: 'fmt',
        job: "Normalize the config files' formatting",
      },
      {
        path: '/reference/cli/seal-key',
        title: 'seal-key',
        job: "Back up or restore the sealing key through the repo's passphrase-protected escrow",
      },
      {
        path: '/reference/cli/explain',
        title: 'explain',
        job: 'The model, printed for one resource: declared, actual, acknowledged, and its history',
      },
      {
        path: '/reference/cli/machines',
        title: 'machines',
        job: "Every machine's stamp: who applied what, and who is behind",
      },
      {
        path: '/reference/cli/doctor',
        title: 'doctor',
        job: 'Is niwa itself healthy? The journal, the archives, the secrets, the lockfile, the watcher',
      },
      {
        path: '/reference/cli/update',
        title: 'update',
        job: 'Re-resolve the lockfile and show the diff before writing it',
      },
      {
        path: '/reference/cli/init',
        title: 'init',
        job: 'Write a starter config that describes this machine, install the editor types, and load the watcher. Once per machine',
      },
      {
        path: '/reference/cli/history',
        title: 'history',
        job: 'Browse the applies before the most recent one',
      },
      {
        path: '/reference/cli/export',
        title: 'export',
        job: 'Render this machine as a readable document',
      },
      {
        path: '/reference/cli/tag',
        title: 'tag',
        job: "Set, list, or remove this machine's tags",
      },
      {
        path: '/reference/cli/migrate',
        title: 'migrate',
        job: 'Rewrite deprecated config forms in place',
      },
      {
        path: '/reference/cli/self',
        title: 'self',
        job: 'The tool updating itself, always as a decision',
      },
      {
        path: '/reference/cli/uninstall',
        title: 'uninstall',
        job: 'Remove niwa and leave the machine exactly as it stands',
      },
    ],
  },
  {
    label: 'Luau API',
    entries: [
      {
        path: '/reference/api',
        title: 'The Luau API',
        job: 'State the three layers, the exported types, and how the types reach the editor',
      },
      {
        path: '/reference/api/packages',
        title: 'Packages and tools',
        job: 'Install and manage packages, casks, and binaries',
      },
      {
        path: '/reference/api/files',
        title: 'Files and links',
        job: 'Manage files, symlinks, and rendered templates',
      },
      {
        path: '/reference/api/settings',
        title: 'System settings',
        job: 'Manage macOS system settings and defaults',
      },
      {
        path: '/reference/api/services',
        title: 'Services',
        job: 'Manage launchd services and scheduled jobs',
      },
      {
        path: '/reference/api/human',
        title: 'Manual steps',
        job: 'Manage manual steps and checklist items',
      },
      {
        path: '/reference/api/functions',
        title: 'Luau utilities',
        job: 'Utility functions and generic resource definition',
      },
      {
        path: '/reference/api/facts',
        title: 'Facts',
        job: 'Computed values available in config',
      },
    ],
  },
  {
    label: 'Reference',
    entries: [
      {
        path: '/reference',
        title: 'Reference',
        job: 'Index the twenty verbs by how often you reach for them, and route to the rest',
      },
      {
        path: '/reference/files',
        title: 'File locations',
        job: 'Say where every file lives and which are committed',
      },
      {
        path: '/reference/formats',
        title: 'File formats',
        job: 'Give the exact shape of niwa.lock, journal.json, state/<machine>.toml, and .luaurc',
      },
      {
        path: '/reference/output',
        title: 'Output, marks, and errors',
        job: 'Fix the mark vocabulary, the color roles, terminal adaptivity, and the four-part error anatomy',
      },
      {
        path: '/reference/environment',
        title: 'Environment variables',
        job: 'Environment variables niwa uses and exports',
      },
    ],
  },
]

/**
 * The path a nav entry is compared against. The build writes directories, so
 * a request arrives with or without a trailing slash and both name one page.
 */
export function currentPath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}

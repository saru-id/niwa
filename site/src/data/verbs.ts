/* The command surface, as data.
 *
 * Twenty verbs: nineteen subcommands declared in `src/cli.rs`, plus bare
 * `niwa`, which `src/main.rs` routes to the dashboard. Every job, every
 * flag meaning and every argument meaning below is the text the binary
 * itself prints. `scripts/check-verbs.mjs` runs the real `--help` and
 * fails the build when this file and the binary disagree.
 *
 * The order is the design's frequency order, which the reference index
 * uses verbatim as its three sections. The binary's own order is
 * different, and the gate compares sets, not order.
 */

/** How often a person reaches for a verb. The design's three groups. */
export type FrequencyId = 'week' | 'occasion' | 'rare'

/** One flag: its name, the argument it takes, and what it does. */
export interface VerbFlag {
  /** As typed, for example `--force`. */
  readonly name: string
  /** The argument shape the help prints, or `''` for a plain switch. */
  readonly argument: string
  /** The binary's own line for this flag. */
  readonly meaning: string
}

/** One positional argument. */
export interface VerbArgument {
  /** `<TARGET>` when required, `[NAME]` when optional. */
  readonly name: string
  readonly meaning: string
}

/** One exit code and the state it reports. */
export interface ExitCode {
  readonly code: 0 | 1 | 2
  readonly when: string
}

/** One screen this verb prints, and the command line that printed it. */
export interface VerbScreen {
  /** A fixture in `tests/snapshots/`. A test binds this to the real set. */
  readonly fixture: string
  readonly command: string
}

export interface Verb {
  /** The verb as typed. `niwa` is the bare command. */
  readonly name: string
  readonly path: string
  /** The binary's `about` line. */
  readonly job: string
  readonly arguments: readonly VerbArgument[]
  readonly flags: readonly VerbFlag[]
  /**
   * Empty unless this verb's codes say more than the shared shape: 0 is
   * success, 1 is an error. The page shows the section only when it is not.
   */
  readonly exits: readonly ExitCode[]
  readonly frequency: FrequencyId
  /** The concept page that explains this verb. A test binds it to the nav. */
  readonly concept: string
  readonly screens: readonly VerbScreen[]
}

/** The three sections of the reference index, in the design's order. */
export const FREQUENCIES: readonly { id: FrequencyId; label: string; when: string }[] = [
  {
    id: 'week',
    label: 'In a normal week',
    when: 'The six you type without thinking.',
  },
  {
    id: 'occasion',
    label: 'When something changed',
    when: 'You reach for these when the machine, the fleet, or the config moved.',
  },
  {
    id: 'rare',
    label: 'Rarely, on purpose',
    when: 'Once per machine, or once in the life of a config.',
  },
]

/**
 * Both global flags, declared once in `src/cli.rs` and accepted by every
 * verb. The command pages point at this list instead of repeating it
 * twenty times.
 */
export const GLOBAL_FLAGS: readonly VerbFlag[] = [
  {
    name: '-v, --verbose',
    argument: '',
    meaning:
      'More detail: -v adds absolutes and groups converged output, -vv lists every resource',
  },
  {
    name: '--debug',
    argument: '',
    meaning: 'Keep the raw stack trace on config errors, for reports',
  },
]

export const VERBS: readonly Verb[] = [
  {
    name: 'niwa',
    path: '/reference/cli/niwa',
    // Bare `niwa` is not a subcommand, so it has no `about` of its own.
    // This line is the design's, and the gate exempts it for that reason.
    job: 'The home screen: everything the tool knows, in one screen',
    arguments: [],
    flags: [],
    exits: [
      { code: 0, when: 'The dashboard printed, or the action you chose succeeded' },
      { code: 1, when: 'The action you chose failed' },
    ],
    frequency: 'week',
    concept: '/concepts/model',
    screens: [{ fixture: 'the_dashboard_screen_answers_in_one_look', command: 'niwa' }],
  },
  {
    name: 'apply',
    path: '/reference/cli/apply',
    job: 'Make the config true: plan, confirm, execute',
    arguments: [],
    flags: [
      { name: '--yes', argument: '', meaning: 'Apply without asking' },
      {
        name: '--dirty',
        argument: '',
        meaning: 'With --yes: allow a config tree with uncommitted changes',
      },
      {
        name: '--force',
        argument: '[<TARGET>...]',
        meaning:
          'Overwrite files that hold edits niwa never wrote: bare covers the run, or name targets to lift one at a time',
      },
      {
        name: '--verify',
        argument: '',
        meaning: 'Re-check everything after the run; fail if anything still reports a change',
      },
      {
        name: '--interactive',
        argument: '',
        meaning: 'Step through every change one decision at a time',
      },
      {
        name: '--no-privileged',
        argument: '',
        meaning: 'Skip the steps that need administrator rights',
      },
      {
        name: '--only',
        argument: '<ONLY>',
        meaning: 'Run one module by name and leave the rest as they stand',
      },
      {
        name: '--sandbox',
        argument: '',
        meaning:
          'Rehearse from nothing: a throwaway home and fake prefixes. Files land there; packages are counted, never installed',
      },
    ],
    exits: [
      { code: 0, when: 'Every step succeeded' },
      {
        code: 1,
        when: 'An error, a cancel at the confirmation, or --verify finding work still pending',
      },
    ],
    frequency: 'week',
    concept: '/concepts/apply',
    screens: [{ fixture: 'apply_pending_piped', command: 'niwa apply --yes' }],
  },
  {
    name: 'plan',
    path: '/reference/cli/plan',
    job: 'Show what apply would do. Exit 0 when in sync, 2 when changes are pending, 1 on an error',
    arguments: [],
    flags: [
      { name: '--diff', argument: '', meaning: 'Render full file diffs, word-level highlighted' },
      {
        name: '--json',
        argument: '',
        meaning: 'The machine interface: one versioned JSON document',
      },
    ],
    exits: [
      { code: 0, when: 'The machine is in sync' },
      { code: 2, when: 'Changes are pending' },
      { code: 1, when: 'An error' },
    ],
    frequency: 'week',
    concept: '/concepts/apply',
    screens: [
      { fixture: 'plan_pending_color', command: 'niwa plan' },
      { fixture: 'plan_converged_piped', command: 'niwa plan' },
    ],
  },
  {
    name: 'pull',
    path: '/reference/cli/pull',
    job: 'Bring machine-side changes home to the config: the inverse of apply',
    arguments: [],
    flags: [
      {
        name: '--all',
        argument: '',
        meaning: 'Stage every finding without the one-at-a-time walk',
      },
    ],
    exits: [],
    frequency: 'week',
    concept: '/concepts/drift',
    screens: [
      {
        fixture: 'the_pull_screen_stages_an_unmanaged_package',
        command: 'niwa pull --all',
      },
    ],
  },
  {
    name: 'add',
    path: '/reference/cli/add',
    job: 'Install something and write its config line, in one motion',
    arguments: [
      { name: '<PROVIDER>', meaning: 'One of: brew, cask, npm, secret' },
      { name: '<NAME>', meaning: 'The package name' },
    ],
    flags: [],
    exits: [],
    frequency: 'week',
    concept: '/concepts/drift',
    screens: [],
  },
  {
    name: 'undo',
    path: '/reference/cli/undo',
    job: 'Reverse the most recent apply',
    arguments: [],
    flags: [{ name: '--yes', argument: '', meaning: 'Undo without asking' }],
    exits: [
      { code: 0, when: 'The apply was reversed, or there was nothing to undo' },
      { code: 1, when: 'A cancel, or a step that could not be reversed' },
    ],
    frequency: 'week',
    concept: '/concepts/safety',
    screens: [],
  },
  {
    name: 'explain',
    path: '/reference/cli/explain',
    job: 'The model, printed for one resource: declared, actual, acknowledged, and its history',
    arguments: [
      {
        name: '<TARGET>',
        meaning:
          'An identity or a unique fragment of one, for example dock.autohide or brew.formula:jq',
      },
    ],
    flags: [],
    exits: [
      { code: 0, when: 'The target resolved' },
      { code: 1, when: 'Nothing matched the target' },
    ],
    frequency: 'occasion',
    concept: '/concepts/model',
    screens: [
      {
        fixture: 'the_explain_screen_prints_the_model_for_one_resource',
        command: 'niwa explain dock.autohide',
      },
    ],
  },
  {
    name: 'check',
    path: '/reference/cli/check',
    job: 'Validate the config: it loads, every spec is well formed, and declarations do not conflict',
    arguments: [],
    flags: [
      {
        name: '--notify',
        argument: '',
        meaning:
          "The watcher's voice: post a notification when something needs a decision. Never applies anything",
      },
      {
        name: '--upstream',
        argument: '',
        meaning:
          'Ask the upstreams: does everything you declare still exist? The watcher runs this weekly',
      },
    ],
    exits: [],
    frequency: 'occasion',
    concept: '/concepts/watcher',
    screens: [
      { fixture: 'check_conflict_piped', command: 'niwa check' },
      { fixture: 'check_unguarded_piped', command: 'niwa check' },
      { fixture: 'check_missing_config_piped', command: 'niwa check' },
    ],
  },
  {
    name: 'update',
    path: '/reference/cli/update',
    job: 'Re-resolve the lockfile and show the diff before writing it',
    arguments: [{ name: '[NAME]', meaning: 'Only pins whose name contains this' }],
    flags: [],
    exits: [],
    frequency: 'occasion',
    concept: '/concepts/machines',
    screens: [],
  },
  {
    name: 'history',
    path: '/reference/cli/history',
    job: 'Browse the applies before the most recent one',
    arguments: [],
    flags: [],
    exits: [{ code: 0, when: 'Always. Reading the journal is not a judgement' }],
    frequency: 'occasion',
    concept: '/concepts/safety',
    screens: [],
  },
  {
    name: 'machines',
    path: '/reference/cli/machines',
    job: "Every machine's stamp: who applied what, and who is behind",
    arguments: [],
    flags: [],
    exits: [{ code: 0, when: 'Always. A machine that is behind is a fact, not an error' }],
    frequency: 'occasion',
    concept: '/concepts/machines',
    screens: [
      {
        fixture: 'the_machines_screen_reads_the_fleet_from_stamps',
        command: 'niwa machines',
      },
    ],
  },
  {
    name: 'doctor',
    path: '/reference/cli/doctor',
    job: 'Is niwa itself healthy? The journal, the archives, the secrets, the lockfile, the watcher',
    arguments: [],
    flags: [
      {
        name: '--deep',
        argument: '',
        meaning: 'Run the expensive checks too: sealed archives decrypt',
      },
    ],
    exits: [],
    frequency: 'occasion',
    concept: '/concepts/safety',
    screens: [],
  },
  {
    name: 'export',
    path: '/reference/cli/export',
    job: 'Render this machine as a readable document',
    arguments: [],
    flags: [{ name: '--markdown', argument: '', meaning: 'The one format that exists' }],
    exits: [{ code: 0, when: 'Always. The document describes the machine as it stands' }],
    frequency: 'occasion',
    concept: '/concepts/model',
    screens: [],
  },
  {
    name: 'tag',
    path: '/reference/cli/tag',
    job: "Set, list, or remove this machine's tags",
    arguments: [
      { name: '[NAME]', meaning: 'The tag to set (or remove, with --remove); bare tag lists' },
    ],
    flags: [
      {
        name: '--remove',
        argument: '',
        meaning: 'Remove the named tag instead of setting it',
      },
    ],
    exits: [],
    frequency: 'occasion',
    concept: '/concepts/machines',
    screens: [],
  },
  {
    name: 'fmt',
    path: '/reference/cli/fmt',
    job: "Normalize the config files' formatting",
    arguments: [],
    flags: [],
    exits: [],
    frequency: 'occasion',
    concept: '/concepts/config',
    screens: [],
  },
  {
    name: 'init',
    path: '/reference/cli/init',
    job: 'Write a starter config that describes this machine, install the editor types, and load the watcher. Once per machine',
    arguments: [],
    flags: [],
    exits: [],
    frequency: 'rare',
    concept: '/concepts/config',
    screens: [],
  },
  {
    name: 'self',
    path: '/reference/cli/self',
    job: 'The tool updating itself, always as a decision',
    arguments: [{ name: '<ACTION>', meaning: 'One of: update' }],
    flags: [
      { name: '--rollback', argument: '', meaning: 'Swap back to the previous pair' },
    ],
    exits: [
      {
        code: 1,
        when: 'Always before 1.0.0. There is no release channel to fetch from yet, and the verb says so',
      },
    ],
    frequency: 'rare',
    concept: '/concepts/limits',
    screens: [],
  },
  {
    name: 'migrate',
    path: '/reference/cli/migrate',
    job: 'Rewrite deprecated config forms in place',
    arguments: [],
    flags: [],
    exits: [],
    frequency: 'rare',
    concept: '/concepts/config',
    screens: [],
  },
  {
    name: 'seal-key',
    path: '/reference/cli/seal-key',
    job: "Back up or restore the sealing key through the repo's passphrase-protected escrow",
    arguments: [{ name: '<ACTION>', meaning: 'One of: backup, restore' }],
    flags: [],
    exits: [],
    frequency: 'rare',
    concept: '/concepts/secrets',
    screens: [],
  },
  {
    name: 'uninstall',
    path: '/reference/cli/uninstall',
    job: 'Remove niwa and leave the machine exactly as it stands',
    arguments: [],
    flags: [
      {
        name: '--purge',
        argument: '',
        meaning: 'Also remove the journal and its undo archives',
      },
    ],
    exits: [],
    frequency: 'rare',
    concept: '/concepts/safety',
    screens: [],
  },
]

/** The verbs of one frequency group, in the design's order. */
export function verbsOf(frequency: FrequencyId): readonly Verb[] {
  return VERBS.filter((verb) => verb.frequency === frequency)
}

/**
 * The usage line, built from the verb's own arguments and flags so it can
 * never drift from the table under it.
 */
export function usage(verb: Verb): string {
  const command = verb.name === 'niwa' ? 'niwa' : `niwa ${verb.name}`
  const parts = [
    ...verb.arguments.map((argument) => argument.name),
    ...verb.flags.map((flag) =>
      flag.argument === '' ? `[${flag.name}]` : `[${flag.name} ${flag.argument}]`,
    ),
  ]
  return [command, ...parts].join(' ')
}

/**
 * The next verb in the same frequency group, wrapping at the end. Every
 * command page ends with one, so a reader can walk a group without
 * returning to the index.
 */
export function neighbour(verb: Verb): Verb {
  const group = verbsOf(verb.frequency)
  const here = group.findIndex((candidate) => candidate.name === verb.name)
  // A verb is always in its own group, so the index is never -1; the fallback
  // exists because the type says the array can be empty and TypeScript is right.
  return group[(here + 1) % group.length] ?? verb
}

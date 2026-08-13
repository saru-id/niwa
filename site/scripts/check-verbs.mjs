// The command reference is the binary's own help, or the build fails.
//
// The gate runs `niwa --help` for the verb list and `niwa <verb> --help`
// for each verb's arguments and flags, then diffs the result against
// `src/data/verbs.ts`. A flag the binary grew and the data does not carry
// fails; so does a flag the data carries and the binary dropped. The same
// for verbs, for positional arguments, and for every line of help text:
// the pages quote the tool, so the quotes have to be current.
//
// The help is piped output, which the tool keeps stable and grep-friendly
// by its own design. Nothing here parses `src/cli.rs`: the binary is the
// truth, and clap is the only thing that has to understand the source.

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = path.resolve(SITE, '..')
const BINARY = path.join(ROOT, 'target', 'debug', 'niwa')
const DATA = 'site/src/data/verbs.ts'
const SOURCE = 'src/cli.rs'

// A debug build from cold on this crate is minutes, not seconds; ten
// minutes is past any honest run and still ends a wedged compile.
const BUILD_TIMEOUT_MS = 600_000
// Printing help is one syscall and a write. Ten seconds is a hang.
const HELP_TIMEOUT_MS = 10_000

/**
 * A home the tool may touch and nobody cares about. `--help` returns
 * before any path resolves, and the gate still hands over a scratch
 * directory rather than the person's real home.
 */
const HOME = mkdtempSync(path.join(tmpdir(), 'niwa-help-'))

if (!existsSync(BINARY)) {
  console.log('Building the tool: target/debug/niwa is missing.')
  const built = spawnSync('cargo', ['build', '--quiet'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'inherit',
    timeout: BUILD_TIMEOUT_MS,
  })
  if (built.error || built.status !== 0) {
    console.error(
      `The tool did not build, so its help could not be read. ` +
        `Run \`cargo build\` at the repository root and read the errors there.`,
    )
    process.exit(1)
  }
}

/** One help screen, as the tool prints it when nothing is a terminal. */
function help(args) {
  const run = spawnSync(BINARY, [...args, '--help'], {
    encoding: 'utf8',
    // NO_COLOR keeps the escape sequences out; FORCE_COLOR in the
    // environment would otherwise paint the help and break every match.
    env: { ...process.env, FORCE_COLOR: '', HOME, NO_COLOR: '1' },
    timeout: HELP_TIMEOUT_MS,
  })
  if (run.error) {
    console.error(`\`niwa ${[...args, '--help'].join(' ')}\` did not run: ${run.error.message}`)
    process.exit(1)
  }
  if (run.status !== 0) {
    console.error(
      `\`niwa ${[...args, '--help'].join(' ')}\` exited ${run.status}. ` +
        'Help is not supposed to fail. Read the tool.',
    )
    process.exit(1)
  }
  return run.stdout
}

/** The indented body of one named section of a help screen. */
function section(text, name) {
  const lines = text.split('\n')
  const start = lines.indexOf(`${name}:`)
  if (start === -1) return []
  const body = []
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '') break
    body.push(line)
  }
  return body
}

/**
 * The rows of a two-column section: a specification, two or more spaces,
 * and its text. A row whose text runs onto another line continues the row
 * above it.
 */
function rows(lines) {
  const found = []
  for (const line of lines) {
    const split = /^\s+(\S.*?)\s{2,}(\S.*)$/.exec(line)
    const last = found[found.length - 1]
    if (!split) {
      const continued = line.trim()
      if (continued !== '' && last) last.text = `${last.text} ${continued}`
      continue
    }
    found.push({ spec: split[1], text: split[2] })
  }
  return found
}

/**
 * Split a flag's specification into its name and its argument shape.
 * clap marks a repeatable flag with a trailing ellipsis; the reference
 * says that in words instead, so the name is compared without it.
 */
function flagOf(row) {
  const tokens = row.spec.split(/\s+/)
  const names = []
  while (tokens.length > 0 && tokens[0].startsWith('-')) names.push(tokens.shift())
  return {
    name: names.join(' ').replace(/\.\.\.$/, ''),
    argument: tokens.join(' '),
    meaning: row.text,
  }
}

/** The flags every verb accepts, which belong to the tool and not to a verb. */
const GLOBAL_NAMES = new Set(['-v, --verbose', '--debug'])
/** clap writes these two itself. They are not part of the surface. */
const CLAP_NAMES = new Set(['-h, --help', '-V, --version'])

/** One verb, read from the binary. */
function readVerb(name) {
  const text = help(name === 'niwa' ? [] : [name])
  const about = []
  for (const line of text.split('\n')) {
    if (line.trim() === '') break
    about.push(line.trim())
  }
  const flags = rows(section(text, 'Options')).map(flagOf)
  return {
    name,
    job: about.join(' '),
    arguments: rows(section(text, 'Arguments')).map((row) => ({
      name: row.spec,
      meaning: row.text,
    })),
    flags: flags.filter((flag) => !GLOBAL_NAMES.has(flag.name) && !CLAP_NAMES.has(flag.name)),
    globals: flags.filter((flag) => GLOBAL_NAMES.has(flag.name)),
  }
}

const problems = []

/** Compare two lists of records by a key, then field by field. */
function diff(where, binary, data, fields) {
  const named = (list) => new Map(list.map((entry) => [entry.name, entry]))
  const inBinary = named(binary)
  const inData = named(data)
  for (const name of inBinary.keys()) {
    if (!inData.has(name)) problems.push(`${where}: the binary has ${name}, ${DATA} does not.`)
  }
  for (const name of inData.keys()) {
    if (!inBinary.has(name)) problems.push(`${where}: ${DATA} has ${name}, the binary does not.`)
  }
  for (const [name, entry] of inBinary) {
    const carried = inData.get(name)
    if (!carried) continue
    for (const field of fields) {
      if (entry[field] !== carried[field]) {
        problems.push(
          `${where}: ${name} has ${field} "${entry[field]}" in the binary, ` +
            `"${carried[field]}" in ${DATA}.`,
        )
      }
    }
  }
}

// Node reads the data module as TypeScript, which it does from 22.18 on.
const data = await import(path.join(SITE, 'src/data/verbs.ts')).catch((cause) => {
  console.error(
    `Reading ${DATA}. Node did not load it: ${cause.message}. ` +
      'The gate reads the data module as TypeScript, which needs Node 22.18 ' +
      'or newer. Upgrade Node and run the gate again.',
  )
  process.exit(1)
})
const { GLOBAL_FLAGS, VERBS } = data

// The subcommands, plus bare `niwa`, which is a verb on the site and a
// missing subcommand to clap. `help` is clap's own and is not documented.
const listed = rows(section(help([]), 'Commands'))
  .map((row) => row.spec)
  .filter((name) => name !== 'help')
const surface = ['niwa', ...listed]

for (const name of surface) {
  if (!VERBS.some((verb) => verb.name === name)) {
    problems.push(`Verbs: the binary has \`${name}\`, ${DATA} does not.`)
  }
}
for (const verb of VERBS) {
  if (!surface.includes(verb.name)) {
    problems.push(`Verbs: ${DATA} has \`${verb.name}\`, the binary does not.`)
  }
}

let flagCount = 0
let argumentCount = 0

for (const verb of VERBS) {
  if (!surface.includes(verb.name)) continue
  const real = readVerb(verb.name)
  flagCount += real.flags.length
  argumentCount += real.arguments.length

  // Bare `niwa` is not a subcommand, so clap prints the tool's own
  // description where a verb prints its `about`. The one line the data
  // carries for it is the design's, and there is nothing to compare.
  if (verb.name !== 'niwa' && real.job !== verb.job) {
    problems.push(
      `\`${verb.name}\`: the binary says "${real.job}", ${DATA} says "${verb.job}".`,
    )
  }
  diff(`\`${verb.name}\` arguments`, real.arguments, verb.arguments, ['meaning'])
  diff(`\`${verb.name}\` flags`, real.flags, verb.flags, ['argument', 'meaning'])
  if (verb.name === 'niwa') {
    diff('Global flags', real.globals, GLOBAL_FLAGS, ['argument', 'meaning'])
    flagCount += real.globals.length
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(problem)
  const counted = problems.length === 1 ? '1 disagreement' : `${problems.length} disagreements`
  console.error(
    `\n${counted} between ${SOURCE} and ${DATA}. ` +
      'The tool is right. Update the data module, never the tool.',
  )
  process.exit(1)
}

console.log(
  `${VERBS.length} verbs, ${flagCount} flags and ${argumentCount} arguments ` +
    'checked against the binary.',
)

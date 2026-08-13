/* The tool's screens, read from the tool's own snapshots.
 *
 * `src/out.rs` paints with a closed set of SGR codes: 31, 32, 33, 36 and 2
 * for the five roles, 1 and 22 for the bold that marks identifiers, and 0 to
 * reset. Nothing else. A code outside that set means the tool changed, so the
 * parser stops the build instead of guessing at a color.
 *
 * The fixtures stay where the tool writes them. The site reads them at build
 * time and keeps no copy of its own.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The color roles of `Role` in `src/out.rs`, one for one. */
export type Role = 'good' | 'warn' | 'bad' | 'muted' | 'accent'

/** One run of text under one set of terminal attributes. */
export type Span = {
  text: string
  /** The role the tool painted this run in, or `null` for plain text. */
  role: Role | null
  /** Bold. The tool wears it on identifiers. */
  bold: boolean
  /** What the mark means, when this span is a mark. `null` otherwise. */
  mark: string | null
}

/** One screen: its lines, each line a list of spans. */
export type Screen = {
  fixture: string
  /** The fixture's path from the repository root, for the caption. */
  source: string
  lines: Span[][]
}

/** The mark vocabulary of `Mark` in `src/out.rs`, and what each one says.
 * A screen reader reads the label instead of the character's own name.
 * `↓` is reserved by the design and has no code path in the tool today. */
const MARKS = new Map<string, string>([
  ['✓', 'done'],
  ['+', 'created'],
  ['~', 'changed'],
  ['-', 'removed'],
  ['✗', 'failed'],
  ['▸', 'in progress'],
  ['↓', 'downloading'],
  ['→', 'waiting on a human'],
  ['↻', 'restarted'],
])

/** The snapshot directory, from the repository root. */
const SNAPSHOTS = join('tests', 'snapshots')

/** Insta names every file after the test module that wrote it. */
const PREFIX = 'snapshots__'
const SUFFIX = '.snap'

/** One `ESC [ … m`. Every escape the tool emits into a screen has this
 * shape; anything else is a sequence the site does not know how to show. */
const SGR = /^\u001b\[([0-9;]*)m/

/** The terminal attributes in force at one point in the output. */
type Attributes = { color: Role | null; faint: boolean; bold: boolean }

/** Read a screen by its fixture name, for example `plan_pending_color`. */
export function readScreen(fixture: string): Screen {
  if (!/^[a-z0-9_]+$/.test(fixture)) {
    throw new Error(
      `Reading a screen. "${fixture}" is not a fixture name. ` +
        `Name the snapshot without its ${PREFIX} prefix and ${SUFFIX} suffix, ` +
        'for example plan_pending_color. The site did not build.',
    )
  }
  const source = `${SNAPSHOTS}/${PREFIX}${fixture}${SUFFIX}`
  const file = join(repository(), source)
  if (!existsSync(file)) {
    throw new Error(
      `Reading the screen "${fixture}". No fixture is at ${file}. ` +
        'Run the tool\'s snapshot tests to write it, or name a fixture that ' +
        'exists. The site did not build.',
    )
  }
  const text = readFileSync(file, 'utf8')
  return { fixture, source, lines: parseScreen(stripHeader(text, source), source) }
}

/** Every fixture the tool ships, by name. */
export function listFixtures(): string[] {
  return readdirSync(join(repository(), SNAPSHOTS))
    .filter((name) => name.startsWith(PREFIX) && name.endsWith(SUFFIX))
    .map((name) => name.slice(PREFIX.length, -SUFFIX.length))
    .sort()
}

/** Drop insta's header: a `---` block holding the test's own bookkeeping.
 * The screen is what follows it, minus the one newline insta adds. */
export function stripHeader(text: string, source: string): string {
  const opening = '---\n'
  const closing = '\n---\n'
  const end = text.startsWith(opening) ? text.indexOf(closing, opening.length - 1) : -1
  if (end === -1) {
    throw new Error(
      `Reading the screen at ${source}. The file has no insta header, ` +
        'so where the screen starts is unknown. Check that the file is a ' +
        'snapshot the tool wrote. The site did not build.',
    )
  }
  const body = text.slice(end + closing.length)
  return body.endsWith('\n') ? body.slice(0, -1) : body
}

/** Parse one screen's escape sequences into spans, line by line. */
export function parseScreen(text: string, source: string): Span[][] {
  // Attributes outlive a line: a terminal carries them across the newline,
  // and so does this. The tool closes every sequence it opens.
  const attributes: Attributes = { color: null, faint: false, bold: false }
  return text
    .split('\n')
    .map((line, index) => parseLine(line, index + 1, source, attributes))
}

function parseLine(
  line: string,
  number: number,
  source: string,
  attributes: Attributes,
): Span[] {
  const spans: Span[] = []
  let text = ''
  let rest = line
  const flush = (): void => {
    if (text !== '') {
      spans.push(span(text, attributes, spans.length === 0))
      text = ''
    }
  }
  while (rest !== '') {
    const escape = rest.indexOf('\u001b')
    if (escape === -1) {
      text += rest
      break
    }
    text += rest.slice(0, escape)
    const sequence = rest.slice(escape)
    const found = SGR.exec(sequence)
    if (!found) {
      throw new Error(
        `Reading the screen at ${source}, line ${number}. It carries ` +
          `${readable(sequence)}, which is not a color sequence the tool ` +
          'emits. Check `src/out.rs`: a screen reaches the site only through ' +
          'the codes the site knows. The site did not build.',
      )
    }
    flush()
    for (const code of (found[1] ?? '').split(';')) {
      apply(attributes, code, source, number)
    }
    rest = rest.slice(escape + found[0].length)
  }
  flush()
  // Every line holds at least one span, so a blank line is still a line.
  return spans.length > 0 ? spans : [{ text: '', role: null, bold: false, mark: null }]
}

/** Move the attributes on by one SGR code, or stop the build. */
function apply(attributes: Attributes, code: string, source: string, number: number): void {
  switch (code) {
    case '0':
      attributes.color = null
      attributes.faint = false
      attributes.bold = false
      break
    case '1':
      attributes.bold = true
      break
    // 2 is faint, which is how the tool says Muted. 22 is normal intensity:
    // it ends bold and faint together, the way a terminal reads it.
    case '2':
      attributes.faint = true
      break
    case '22':
      attributes.bold = false
      attributes.faint = false
      break
    case '31':
      attributes.color = 'bad'
      break
    case '32':
      attributes.color = 'good'
      break
    case '33':
      attributes.color = 'warn'
      break
    case '36':
      attributes.color = 'accent'
      break
    default:
      throw new Error(
        `Reading the screen at ${source}, line ${number}. It carries SGR ` +
          `code "${code}", which the tool did not emit before. Read ` +
          '`src/out.rs`, then teach `src/lib/terminal.ts` and the role tokens ' +
          'what the code means. The site did not build.',
      )
  }
}

function span(text: string, attributes: Attributes, first: boolean): Span {
  const role = attributes.color ?? (attributes.faint ? 'muted' : null)
  // A mark is what `Out::result` prints: one glyph, painted, alone, at the
  // head of its line. A glyph inside running text is text.
  const mark = first && role !== null ? (MARKS.get(text) ?? null) : null
  return { text, role, bold: attributes.bold, mark }
}

/** An escape sequence a person can read in a build log. */
function readable(sequence: string): string {
  return `\`${sequence.slice(0, 12).replaceAll('\u001b', 'ESC')}\``
}

/** The repository root: the first directory above this file, or above the
 * working directory, that holds the tool's snapshots. The site builds from
 * `site/`, and a bundled build can place this module anywhere beneath the
 * repository, so neither anchor is trusted alone. */
function repository(): string {
  const starts = [dirname(fileURLToPath(import.meta.url)), process.cwd()]
  for (const start of starts) {
    for (let directory = start; ; directory = dirname(directory)) {
      if (existsSync(join(directory, SNAPSHOTS))) {
        return directory
      }
      if (dirname(directory) === directory) {
        break
      }
    }
  }
  throw new Error(
    `Looking for the tool's screens. No ${SNAPSHOTS} directory sits above ` +
      `${starts.join(' or ')}. The site reads the fixtures from the tool's ` +
      'own tree, so it must build inside the repository. The site did not build.',
  )
}

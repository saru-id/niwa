// Every Luau snippet on the site type checks against the shipped types.
//
// The gate reads the documentation markdown, writes each ```luau fence into
// a temporary directory arranged the way `niwa init` arranges a config
// repo, and runs the Luau analyzer over the lot. Fences inside .astro files
// are not read: the documentation is markdown, and a snippet that wants to
// live in a page template can move into markdown.
//
// Two rules writers rely on:
//
//   1. A fence containing no `require` is checked with the standard prelude
//      `local niwa = require("@niwa")` prepended, so a snippet can start on
//      the line that matters.
//   2. A fence tagged ```luau no-check is skipped, and counted. It is for
//      deliberate errors and for fragments that cannot stand alone.
//
// Only `luau` fences are checked. `lua` is the grammar's alias for files
// that are not niwa configuration, and these types do not describe them.

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = path.resolve(SITE, '..')
const DOCS = path.join(SITE, 'src/content/docs')
const TYPES = path.join(ROOT, 'share/types')
const PRELUDE = 'local niwa = require("@niwa")'

// The analyzer reads a few hundred lines of types per snippet. A minute is
// far past any honest run, and still ends a hung process before a person
// reaches for the keyboard.
const TIMEOUT_MS = 60_000

/** Every markdown file under a directory, in a stable order. */
function markdownFiles(directory) {
  const found = []
  const entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )
  for (const entry of entries) {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) found.push(...markdownFiles(full))
    else if (entry.name.endsWith('.md')) found.push(full)
  }
  return found
}

/**
 * The fenced blocks of one markdown file.
 *
 * Each carries its info string and the 1-based line its body starts on,
 * which is what turns an analyzer position back into a place to open. A
 * fence left open at the end of the file yields nothing.
 */
function fences(source) {
  const lines = source.split('\n')
  const found = []
  let open = null

  lines.forEach((line, index) => {
    const marker = /^(`{3,})(.*)$/.exec(line)
    if (!marker) return

    if (open === null) {
      open = { info: marker[2].trim(), ticks: marker[1], bodyLine: index + 2 }
      return
    }
    if (marker[1].length < open.ticks.length || marker[2].trim() !== '') return

    const [language, ...flags] = open.info.split(/\s+/)
    found.push({
      bodyLine: open.bodyLine,
      code: lines.slice(open.bodyLine - 1, index).join('\n'),
      flags,
      language,
    })
    open = null
  })

  return found
}

const snippets = []
let skipped = 0

for (const file of markdownFiles(DOCS)) {
  for (const fence of fences(readFileSync(file, 'utf8'))) {
    if (fence.language !== 'luau') continue
    if (fence.flags.includes('no-check')) skipped += 1
    else snippets.push({ ...fence, file })
  }
}

if (snippets.length > 0) {
  const directory = mkdtempSync(path.join(tmpdir(), 'niwa-luau-'))

  // The alias arrangement `niwa init` writes, with `niwa` pointed at this
  // checkout's types rather than the installed copy.
  writeFileSync(
    path.join(directory, '.luaurc'),
    `${JSON.stringify(
      { languageMode: 'strict', aliases: { niwa: TYPES, self: '.' } },
      null,
      2,
    )}\n`,
  )

  const written = new Map()
  snippets.forEach((snippet, index) => {
    const name = `snippet-${String(index + 1).padStart(3, '0')}.luau`
    const prelude = /\brequire\s*\(/.test(snippet.code) ? [] : [PRELUDE]
    writeFileSync(
      path.join(directory, name),
      `${[...prelude, snippet.code].join('\n')}\n`,
    )
    written.set(name, { ...snippet, offset: prelude.length })
  })

  const analyzed = spawnSync('luau-analyze', [...written.keys()], {
    cwd: directory,
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
  })

  if (analyzed.error) {
    const message =
      analyzed.error.code === 'ENOENT'
        ? 'luau-analyze is not installed. Install it with: brew install luau'
        : `luau-analyze did not run: ${analyzed.error.message}`
    console.error(message)
    process.exit(1)
  }

  if (analyzed.status !== 0) {
    const output = `${analyzed.stdout ?? ''}${analyzed.stderr ?? ''}`.trimEnd()
    for (const line of output.split('\n')) {
      // `./snippet-001.luau(4,7): TypeError: …` names a place in the copy.
      // Say where the writer can open it instead.
      const at = /^\.\/(snippet-\d+\.luau)\((\d+),(\d+)\): (.*)$/.exec(line)
      const snippet = at && written.get(at[1])
      if (!snippet) {
        console.error(line)
        continue
      }
      const row = snippet.bodyLine + Number(at[2]) - 1 - snippet.offset
      console.error(`${path.relative(SITE, snippet.file)}:${row}:${at[3]}: ${at[4]}`)
    }
    console.error(
      `\n${snippets.length} Luau snippets checked, ${skipped} skipped. The types above disagree with the documentation.`,
    )
    process.exit(1)
  }
}

console.log(`${snippets.length} Luau snippets checked, ${skipped} skipped.`)

// Every Luau snippet on the site type checks against the shipped types.
//
// The gate reads two inputs. The documentation markdown gives one snippet
// per ```luau fence. `src/snippets/` gives one snippet per file, whole,
// kept as Luau on disk so the analyzer reads what a reader sees. The gate
// writes both into a temporary directory arranged the way `niwa init`
// arranges a config repo, and runs the Luau analyzer over the lot. Fences inside .astro files
// are not read: the documentation is markdown, and a snippet that wants to
// live in a page template can move into markdown.
//
// Three rules writers rely on:
//
//   1. A fence containing no `require` is checked with the standard prelude
//      `local niwa = require("@niwa")` prepended, so a snippet can start on
//      the line that matters.
//   2. A fence tagged ```luau no-check is skipped, and counted. It is for
//      deliberate errors and for fragments that cannot stand alone.
//   3. A file under `src/snippets/` is copied byte for byte. It gets no
//      prelude, because a whole config writes its own. It must not require
//      `@self/*`: the temporary directory points `@self` at itself, and a
//      snippet file has no side files there.
//
// Only `luau` fences are checked. `lua` is the grammar's alias for files
// that are not niwa configuration, and these types do not describe them.

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = path.resolve(SITE, '..')
const DOCS = path.join(SITE, 'src/content/docs')
const SNIPPETS = path.join(SITE, 'src/snippets')
const TYPES = path.join(ROOT, 'share/types')
const PRELUDE = 'local niwa = require("@niwa")'

// The analyzer reads a few hundred lines of types per snippet. A minute is
// far past any honest run, and still ends a hung process before a person
// reaches for the keyboard.
const TIMEOUT_MS = 60_000

/** Every file with an extension under a directory, in a stable order. */
function filesUnder(directory, extension) {
  const found = []
  const entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )
  for (const entry of entries) {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) found.push(...filesUnder(full, extension))
    else if (entry.name.endsWith(extension)) found.push(full)
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

for (const file of filesUnder(DOCS, '.md')) {
  for (const fence of fences(readFileSync(file, 'utf8'))) {
    if (fence.language !== 'luau') continue
    if (fence.flags.includes('no-check')) skipped += 1
    else snippets.push({ ...fence, file, whole: false })
  }
}

// The directory ships with the site; a checkout without it has nothing to
// check there, which is a state and not an error.
if (existsSync(SNIPPETS)) {
  for (const file of filesUnder(SNIPPETS, '.luau')) {
    snippets.push({ code: readFileSync(file, 'utf8'), file, whole: true })
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
    // A whole file keeps its path in its name, flattened. Flattening can
    // collide two nested paths on one name, and a collision would silently
    // drop a snippet from the analysis, so a duplicate stops the gate.
    if (snippet.whole) {
      const relative = path.relative(SNIPPETS, snippet.file)
      const name = `file-${relative.replaceAll(path.sep, '-')}`
      if (written.has(name)) {
        console.error(`${snippet.file}: flattens to '${name}', which ${written.get(name).file} already uses. Rename one.`)
        process.exit(1)
      }
      writeFileSync(path.join(directory, name), snippet.code)
      written.set(name, snippet)
      return
    }
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
      const at = /^\.\/(\S+\.luau)\((\d+),(\d+)\): (.*)$/.exec(line)
      const snippet = at && written.get(at[1])
      if (!snippet) {
        console.error(line)
        continue
      }
      // A whole file is copied unchanged, so the analyzer already names its
      // rows. A fence sits inside a page, below a prelude the writer did
      // not type.
      const row = snippet.whole
        ? Number(at[2])
        : snippet.bodyLine + Number(at[2]) - 1 - snippet.offset
      console.error(`${path.relative(SITE, snippet.file)}:${row}:${at[3]}: ${at[4]}`)
    }
    console.error(
      `\n${snippets.length} Luau snippets checked, ${skipped} skipped. The types above disagree with the documentation.`,
    )
    process.exit(1)
  }
}

console.log(`${snippets.length} Luau snippets checked, ${skipped} skipped.`)

/* The environment table is what the tool actually reads.
 *
 * The test reads every `env::var` and `env::var_os` call site in the Rust
 * source and compares the names it finds with `env.ts`. One call site
 * takes the name as an argument (`xdg_dir` in `src/paths.rs`), so a name
 * that arrives through a parameter is followed back to the literals its
 * callers pass. A name that cannot be followed fails the test rather than
 * going quiet: silence would read as absence.
 *
 * Comments are not stripped. A comment that writes out an `env::var` call
 * is documenting a real read, and the test would rather ask about one
 * than miss one.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ENV_VARS, envOf } from './env'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const DATA = 'site/src/data/env.ts'

/** An environment variable name as Rust writes it. */
const LITERAL = /^"([A-Z][A-Z0-9_]*)"$/
/** Every read of the environment, whatever the path to `env`. */
const READ = /\benv::var(?:_os)?\s*\(/g

type Source = { path: string; text: string }

function rustSources(directory: string): Source[] {
  const found: Source[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const full = join(directory, entry.name)
    if (entry.isDirectory()) found.push(...rustSources(full))
    else if (entry.name.endsWith('.rs')) found.push({ path: full, text: readFileSync(full, 'utf8') })
  }
  return found
}

/**
 * The arguments of the call whose opening parenthesis sits at `open`,
 * split at the commas that belong to this call and no deeper one.
 */
function callArguments(text: string, open: number): string[] {
  const found: string[] = []
  let depth = 0
  let start = open + 1
  let inString = false
  for (let index = open; index < text.length; index += 1) {
    const character = text[index]
    if (inString) {
      if (character === '\\') index += 1
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') {
      inString = true
    } else if (character === '(' || character === '[' || character === '{') {
      depth += 1
    } else if (character === ')' || character === ']' || character === '}') {
      depth -= 1
      if (depth === 0) {
        found.push(text.slice(start, index).trim())
        break
      }
    } else if (character === ',' && depth === 1) {
      found.push(text.slice(start, index).trim())
      start = index + 1
    }
  }
  return found.filter((argument) => argument !== '')
}

/** The function whose body holds `at`, and its parameter names in order. */
function enclosingFunction(text: string, at: number): { name: string; parameters: string[] } | null {
  const signatures = [...text.slice(0, at).matchAll(/\bfn\s+([a-z_][a-z0-9_]*)\s*\(/g)]
  const signature = signatures[signatures.length - 1]
  if (!signature || signature[1] === undefined) return null
  const open = signature.index + signature[0].length - 1
  return {
    name: signature[1],
    parameters: callArguments(text, open).map((parameter) => parameter.split(':')[0]?.trim() ?? ''),
  }
}

/** The literals every caller passes at one parameter position. */
function passedAt(sources: Source[], fn: string, position: number): string[] {
  const found: string[] = []
  for (const source of sources) {
    for (const call of source.text.matchAll(new RegExp(`\\b${fn}\\s*\\(`, 'g'))) {
      // The definition is not a call site.
      if (/\bfn\s+$/.test(source.text.slice(Math.max(0, call.index - 4), call.index))) continue
      const argument = callArguments(source.text, call.index + call[0].length - 1)[position]
      const literal = argument === undefined ? null : LITERAL.exec(argument)
      if (literal?.[1] !== undefined) found.push(literal[1])
    }
  }
  return found
}

const sources = rustSources(join(ROOT, 'src'))
const read = new Set<string>()
const unresolved: string[] = []

for (const source of sources) {
  for (const site of source.text.matchAll(READ)) {
    const open = site.index + site[0].length - 1
    const argument = callArguments(source.text, open)[0]
    const literal = argument === undefined ? null : LITERAL.exec(argument)
    if (literal?.[1] !== undefined) {
      read.add(literal[1])
      continue
    }
    const enclosing = argument === undefined ? null : enclosingFunction(source.text, site.index)
    const position = enclosing?.parameters.indexOf(argument ?? '') ?? -1
    const passed = enclosing && position >= 0 ? passedAt(sources, enclosing.name, position) : []
    if (passed.length === 0) {
      unresolved.push(`${source.path}: env::var(${argument ?? ''})`)
      continue
    }
    for (const name of passed) read.add(name)
  }
}

describe('the environment table', () => {
  it('follows every read back to a name', () => {
    expect(unresolved, 'a read the test could not follow to a variable name').toEqual([])
  })

  it('names every variable the tool reads', () => {
    const carried = new Set(envOf('tool').map((variable) => variable.name))
    const missing = [...read].filter((name) => !carried.has(name)).sort()
    expect(missing, `read by the tool, missing from ${DATA}`).toEqual([])
  })

  it('names nothing the tool stopped reading', () => {
    const extra = envOf('tool')
      .map((variable) => variable.name)
      .filter((name) => !read.has(name))
      .sort()
    expect(extra, `in ${DATA}, no longer read by the tool`).toEqual([])
  })

  it('names each variable once', () => {
    const names = ENV_VARS.map((variable) => variable.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('gives every variable a role', () => {
    for (const variable of ENV_VARS) {
      expect(variable.role.length, variable.name).toBeGreaterThan(0)
    }
  })

  it("finds the installer's two in install.sh", () => {
    const installer = readFileSync(join(ROOT, 'install.sh'), 'utf8')
    for (const variable of envOf('installer')) {
      expect(installer, variable.name).toContain(variable.name)
    }
  })
})

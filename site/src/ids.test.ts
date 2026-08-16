import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { NAV } from './nav'

// An id names one element. Break that and every reference to the name lands
// on whichever element the browser reached first, which is the failure the
// chrome invites: the rail renders three times on a documentation page, so a
// fixed id in it would ship three times and its labels would resolve to a
// copy the reader is not in.
//
// The build is the only place the copies meet, so the check reads pages the
// build wrote and holds every one of them to the rule. It writes them to a
// directory of its own rather than reading `dist/`, because a check that can
// read the output of an older build can pass on work that no longer exists.

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ASTRO = path.join(SITE, 'node_modules/astro/bin/astro.mjs')

const output = mkdtempSync(path.join(tmpdir(), 'niwa-ids-'))
execFileSync(process.execPath, [ASTRO, 'build', '--outDir', output], {
  cwd: SITE,
  // A build that works says nothing on this stream, so silence here is the
  // build's own report and a failure arrives whole.
  stdio: ['ignore', 'ignore', 'inherit'],
  env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' },
})
afterAll(() => rmSync(output, { recursive: true, force: true }))

/** Every page the build wrote, named by the address it is served at. */
function builtPages(directory = output): readonly string[] {
  const found: string[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) found.push(...builtPages(full))
    else if (entry.name.endsWith('.html')) found.push(full)
  }
  return found
}

const pages = builtPages().map((file) => ({
  name: `/${path.relative(output, file).split(path.sep).join('/')}`,
  html: readFileSync(file, 'utf8'),
}))

/** Every id on a page, in the order the page carries them. */
const idsOn = (html: string): readonly string[] =>
  [...html.matchAll(/\sid="([^"]*)"/g)].map((match) => match[1])

/** Every id a page's labels name. One label may name several. */
const labelsOn = (html: string): readonly string[] =>
  [...html.matchAll(/\saria-labelledby="([^"]*)"/g)].flatMap((match) =>
    match[1].split(/\s+/).filter((id) => id !== ''),
  )

/** The ids a page emits more than once, sorted so a failure reads the same. */
function repeated(ids: readonly string[]): readonly string[] {
  const seen = new Set<string>()
  const twice = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) twice.add(id)
    seen.add(id)
  }
  return [...twice].sort()
}

describe('the built site', () => {
  it('writes pages to read', () => {
    expect(pages.length).toBeGreaterThan(0)
  })

  it('names each element on a page once', () => {
    for (const page of pages) {
      expect(repeated(idsOn(page.html)), page.name).toEqual([])
    }
  })

  it('points every label at an id its own page carries', () => {
    for (const page of pages) {
      const carried = new Set(idsOn(page.html))
      for (const label of labelsOn(page.html)) {
        expect(carried.has(label), `${page.name} names ${label}`).toBe(true)
      }
    }
  })
})

describe('a documentation page', () => {
  it('carries one set of rail ids per copy', () => {
    const docs = pages.find((page) => page.name === '/concepts/model/index.html')
    if (docs === undefined) throw new Error('The build wrote no /concepts/model/index.html.')
    const ids = idsOn(docs.html)
    for (const copy of ['rail', 'drawer', 'noscript']) {
      expect(ids.filter((id) => id.startsWith(`${copy}-`)).length, copy).toBe(NAV.length)
    }
  })
})

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LANDING, NAV, SITE, currentPath, groupOpens } from './nav'

describe('the sidebar', () => {
  it('carries six groups in the order the brief fixes', () => {
    expect(NAV.map((group) => group.label)).toEqual([
      'Start',
      'Concepts',
      'Guides',
      'Commands',
      'Luau API',
      'Reference',
    ])
  })

  it('carries the counts the page inventory states', () => {
    expect(NAV.map((group) => group.entries.length)).toEqual([5, 12, 11, 20, 8, 5])
  })

  it('describes sixty-two pages, the landing included', () => {
    const pages = NAV.flatMap((group) => group.entries).length + 1
    expect(pages).toBe(62)
  })

  it('folds Commands and nothing else', () => {
    expect(NAV.filter((group) => group.folded).map((group) => group.label)).toEqual(['Commands'])
  })

  it('gives every entry a path, a title, and a job', () => {
    for (const entry of [LANDING, ...NAV.flatMap((group) => group.entries)]) {
      expect(entry.path.startsWith('/'), entry.path).toBe(true)
      expect(entry.path.endsWith('/'), entry.path).toBe(entry.path === '/')
      expect(entry.title.length, entry.path).toBeGreaterThan(0)
      expect(entry.job.length, entry.path).toBeGreaterThan(0)
    }
  })

  it('names each page once', () => {
    const paths = [LANDING, ...NAV.flatMap((group) => group.entries)].map((entry) => entry.path)
    expect(new Set(paths).size).toBe(paths.length)
  })
})

describe('the current page', () => {
  it('reads the same with or without a trailing slash', () => {
    expect(currentPath('/concepts/model/')).toBe('/concepts/model')
    expect(currentPath('/concepts/model')).toBe('/concepts/model')
    expect(currentPath('/')).toBe('/')
  })

  it('opens a folded group only from inside it', () => {
    const commands = NAV[3]
    expect(commands).toBeDefined()
    if (!commands) return
    expect(groupOpens(commands, '/concepts/model')).toBe(false)
    expect(groupOpens(commands, '/reference/cli/apply/')).toBe(true)
  })

  it('leaves the other groups open everywhere', () => {
    for (const group of NAV.filter((candidate) => !candidate.folded)) {
      expect(groupOpens(group, '/reference/cli/apply')).toBe(true)
    }
  })
})

describe('the version in the footer', () => {
  // The footer names the version once. This is the only place the site
  // states it, so it is bound to the crate that ships.
  it('is the crate version', () => {
    const manifest = readFileSync(new URL('../../Cargo.toml', import.meta.url), 'utf8')
    expect(manifest).toContain(`version = "${SITE.version}"`)
  })
})

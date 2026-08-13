/* A deliberate-sync gate.
 *
 * The API pages are transcribed from `share/types/init.luau`. Nothing can
 * check a sentence against a type, so the test checks the file: while the
 * types are the file the descriptions were written against, the pages are
 * as true as the person who wrote them. When the file moves, the digest
 * fails and somebody reads it again.
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FACTS } from './facts'
import { FUNCTIONS } from './functions'
import { GROUPS, RESOURCES, anchor, resourcesOf } from './resources'
import { TYPES_DIGEST } from './types-digest'

const TYPES = readFileSync(new URL('../../../share/types/init.luau', import.meta.url), 'utf8')

/** The last segment of a dotted name: what the type file declares. */
function field(name: string): string {
  const parts = name.split('.')
  return parts[parts.length - 1] ?? name
}

describe('the shipped types', () => {
  it('are the file the data modules were written against', () => {
    const digest = createHash('sha256').update(TYPES).digest('hex')
    expect(
      digest,
      'the shipped types changed; re-read them, update the data modules, then update the digest',
    ).toBe(TYPES_DIGEST)
  })

  it('declare every name the reference documents', () => {
    for (const entry of [...RESOURCES, ...FUNCTIONS, ...FACTS]) {
      expect(TYPES, entry.name).toMatch(new RegExp(`(^|\\s)${field(entry.name)}:`, 'm'))
    }
  })
})

describe('the resource pages', () => {
  it('carry twenty calls in five groups', () => {
    expect(RESOURCES.length).toBe(20)
    expect(GROUPS.map((group) => resourcesOf(group.id).length)).toEqual([7, 2, 6, 3, 2])
  })

  it('leaves no call off a page', () => {
    const grouped = GROUPS.flatMap((group) => resourcesOf(group.id))
    expect(grouped.length).toBe(RESOURCES.length)
  })

  it('gives every entry a deep link of its own', () => {
    const anchors = RESOURCES.map((resource) => anchor(resource.name))
    expect(new Set(anchors).size).toBe(anchors.length)
    expect(anchor('niwa.brew.cask')).toBe('brew-cask')
    expect(anchor('niwa.github_release')).toBe('github-release')
  })

  it('signs every call with its own name', () => {
    for (const resource of RESOURCES) {
      expect(resource.signature.startsWith(`${resource.name}(`), resource.name).toBe(true)
      expect(resource.description.length, resource.name).toBeGreaterThan(0)
    }
  })
})

describe('the functions and facts', () => {
  it('are eight names over eight signatures', () => {
    expect(FUNCTIONS.length).toBe(8)
    expect(FUNCTIONS.flatMap((entry) => entry.signatures).length).toBe(8)
  })

  it('are seven facts', () => {
    expect(FACTS.length).toBe(7)
  })

  it('signs every entry with its own name', () => {
    for (const entry of FUNCTIONS) {
      for (const signature of entry.signatures) {
        expect(signature.startsWith(entry.name), entry.name).toBe(true)
      }
    }
    for (const fact of FACTS) {
      expect(fact.signature.startsWith(`${fact.name}:`), fact.name).toBe(true)
    }
  })
})

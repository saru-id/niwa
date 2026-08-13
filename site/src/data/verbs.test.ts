/* The verb data against everything that is not the binary.
 *
 * `scripts/check-verbs.mjs` holds the binary to this file. Here the file
 * is held to the rest of the site: the fixtures the tool actually wrote,
 * the pages the nav declares, and the frequency grouping the reference
 * index renders.
 */

import { describe, expect, it } from 'vitest'
import { listFixtures } from '../lib/terminal'
import { NAV } from '../nav'
import { FREQUENCIES, VERBS, neighbour, usage, verbsOf } from './verbs'

const paths = new Set(NAV.flatMap((group) => group.entries).map((entry) => entry.path))
const commands = NAV.find((group) => group.label === 'Commands')

describe('the twenty verbs', () => {
  it('are twenty', () => {
    expect(VERBS.length).toBe(20)
  })

  it('name each verb and each page once', () => {
    expect(new Set(VERBS.map((verb) => verb.name)).size).toBe(20)
    expect(new Set(VERBS.map((verb) => verb.path)).size).toBe(20)
  })

  it('are the pages the nav declares', () => {
    expect(commands).toBeDefined()
    expect(commands?.entries.map((entry) => entry.path).sort()).toEqual(
      VERBS.map((verb) => verb.path).sort(),
    )
  })

  it('sit under /reference/cli', () => {
    for (const verb of VERBS) {
      expect(verb.path).toBe(`/reference/cli/${verb.name}`)
      expect(verb.job.length, verb.name).toBeGreaterThan(0)
    }
  })
})

describe('the frequency grouping', () => {
  it('splits the twenty six, nine, five', () => {
    expect(FREQUENCIES.map((frequency) => verbsOf(frequency.id).length)).toEqual([6, 9, 5])
  })

  it('puts every verb in exactly one group', () => {
    const grouped = FREQUENCIES.flatMap((frequency) => verbsOf(frequency.id))
    expect(grouped.length).toBe(VERBS.length)
  })

  it('walks a group in a circle', () => {
    for (const frequency of FREQUENCIES) {
      const group = verbsOf(frequency.id)
      const walked = new Set<string>()
      let here = group[0]
      for (let step = 0; step < group.length; step += 1) {
        expect(here).toBeDefined()
        if (!here) break
        walked.add(here.name)
        here = neighbour(here)
      }
      expect(walked.size).toBe(group.length)
      expect(here?.name).toBe(group[0]?.name)
    }
  })
})

describe('the screens a command page shows', () => {
  it('are fixtures the tool wrote', () => {
    const fixtures = new Set(listFixtures())
    for (const verb of VERBS) {
      for (const screen of verb.screens) {
        expect(fixtures.has(screen.fixture), `${verb.name}: ${screen.fixture}`).toBe(true)
      }
    }
  })

  it('caption themselves with a niwa command line', () => {
    for (const verb of VERBS) {
      for (const screen of verb.screens) {
        expect(screen.command.startsWith('niwa'), screen.fixture).toBe(true)
      }
    }
  })

  it('are named once each', () => {
    const named = VERBS.flatMap((verb) => verb.screens.map((screen) => screen.fixture))
    expect(new Set(named).size).toBe(named.length)
  })
})

describe('a command page', () => {
  it('links to a concept page that exists', () => {
    for (const verb of VERBS) {
      expect(paths.has(verb.concept), `${verb.name} -> ${verb.concept}`).toBe(true)
    }
  })

  it('states a usage line built from its own table', () => {
    const dashboard = VERBS.find((verb) => verb.name === 'niwa')
    expect(dashboard && usage(dashboard)).toBe('niwa')
    const add = VERBS.find((verb) => verb.name === 'add')
    expect(add && usage(add)).toBe('niwa add <PROVIDER> <NAME>')
    const plan = VERBS.find((verb) => verb.name === 'plan')
    expect(plan && usage(plan)).toBe('niwa plan [--diff] [--json]')
    const apply = VERBS.find((verb) => verb.name === 'apply')
    expect(apply && usage(apply)).toContain('[--force [<TARGET>...]]')
  })

  it('shows exit codes only where they say more than 0 and 1', () => {
    const named = VERBS.filter((verb) => verb.exits.length > 0).map((verb) => verb.name)
    expect(named).toEqual([
      'niwa',
      'apply',
      'plan',
      'undo',
      'explain',
      'history',
      'machines',
      'export',
      'self',
    ])
  })
})

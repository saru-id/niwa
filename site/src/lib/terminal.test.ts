import { describe, expect, it } from 'vitest'
import { listFixtures, parseScreen, readScreen, stripHeader } from './terminal'

const ESC = '\u001b'
const HEADER = '---\nsource: tests/snapshots.rs\nexpression: run.stdout\n---\n'

describe('stripHeader', () => {
  it('drops insta’s header and the newline it adds', () => {
    expect(stripHeader(`${HEADER}one\ntwo\n`, 'test')).toBe('one\ntwo')
  })

  it('keeps a blank line inside the screen', () => {
    expect(stripHeader(`${HEADER}one\n\ntwo\n`, 'test')).toBe('one\n\ntwo')
  })

  it('keeps a line of dashes that is part of the screen', () => {
    expect(stripHeader(`${HEADER}one\n---\ntwo\n`, 'test')).toBe('one\n---\ntwo')
  })

  it('refuses a file with no header', () => {
    expect(() => stripHeader('one\ntwo\n', 'test')).toThrow(/no insta header/)
  })
})

describe('parseScreen', () => {
  it('reads plain text as one span', () => {
    expect(parseScreen('3 resources · nothing to do', 'test')).toEqual([
      [{ text: '3 resources · nothing to do', role: null, bold: false, mark: null }],
    ])
  })

  it('reads every code in the closed set', () => {
    const codes = `${ESC}[32mgood${ESC}[0m${ESC}[33mwarn${ESC}[0m${ESC}[31mbad${ESC}[0m${ESC}[2mmuted${ESC}[0m${ESC}[36maccent${ESC}[0m${ESC}[1mbold${ESC}[22mplain`
    expect(parseScreen(codes, 'test')[0]).toEqual([
      { text: 'good', role: 'good', bold: false, mark: null },
      { text: 'warn', role: 'warn', bold: false, mark: null },
      { text: 'bad', role: 'bad', bold: false, mark: null },
      { text: 'muted', role: 'muted', bold: false, mark: null },
      { text: 'accent', role: 'accent', bold: false, mark: null },
      { text: 'bold', role: null, bold: true, mark: null },
      { text: 'plain', role: null, bold: false, mark: null },
    ])
  })

  it('keeps the role under a bold run, the way a terminal does', () => {
    const line = `${ESC}[31m- was ${ESC}[1mhere${ESC}[22m gone${ESC}[0m`
    expect(parseScreen(line, 'test')[0]).toEqual([
      { text: '- was ', role: 'bad', bold: false, mark: null },
      { text: 'here', role: 'bad', bold: true, mark: null },
      { text: ' gone', role: 'bad', bold: false, mark: null },
    ])
  })

  it('labels a mark, and leaves a glyph inside text alone', () => {
    const lines = parseScreen(
      `${ESC}[32m✓${ESC}[0m done\n${ESC}[2mfalse → true${ESC}[0m`,
      'test',
    )
    expect(lines[0]?.[0]).toEqual({ text: '✓', role: 'good', bold: false, mark: 'done' })
    expect(lines[0]?.[1]?.mark).toBeNull()
    expect(lines[1]?.[0]?.mark).toBeNull()
  })

  it('names every mark in the vocabulary', () => {
    const marks = ['✓', '+', '~', '-', '✗', '▸', '↓', '→', '↻']
    const screen = parseScreen(marks.map((mark) => `${ESC}[36m${mark}${ESC}[0m x`).join('\n'), 'test')
    expect(screen.map((line) => line[0]?.mark)).toEqual([
      'done',
      'created',
      'changed',
      'removed',
      'failed',
      'in progress',
      'downloading',
      'waiting on a human',
      'restarted',
    ])
  })

  it('gives a blank line one empty span', () => {
    expect(parseScreen('one\n\ntwo', 'test')[1]).toEqual([
      { text: '', role: null, bold: false, mark: null },
    ])
  })

  it('refuses a code the tool does not emit', () => {
    expect(() => parseScreen(`${ESC}[35mmagenta${ESC}[0m`, 'a_screen')).toThrow(
      /a_screen, line 1.*code "35"/s,
    )
  })

  it('refuses a sequence that is not a color', () => {
    expect(() => parseScreen(`one\ntwo${ESC}[K`, 'a_screen')).toThrow(
      /a_screen, line 2.*ESC\[K/s,
    )
    expect(() => parseScreen(`${ESC}]8;;file:///tmp${ESC}\\here`, 'a_screen')).toThrow(
      /not a color sequence/,
    )
  })
})

describe('readScreen', () => {
  it('reads a real screen from the tool', () => {
    const screen = readScreen('plan_pending_color')
    expect(screen.source).toBe('tests/snapshots/snapshots__plan_pending_color.snap')
    // ` shell ─────`, then `+ ~/.zshrc` with the path in bold.
    expect(screen.lines[0]?.[0]?.text).toContain('─')
    expect(screen.lines[1]?.[0]).toEqual({
      text: '+',
      role: 'good',
      bold: false,
      mark: 'created',
    })
    expect(screen.lines[1]?.[2]).toEqual({
      text: '~/.zshrc',
      role: null,
      bold: true,
      mark: null,
    })
  })

  it('parses every fixture the tool ships', () => {
    const fixtures = listFixtures()
    expect(fixtures).toContain('plan_pending_color')
    for (const fixture of fixtures) {
      expect(() => readScreen(fixture), fixture).not.toThrow()
    }
  })

  it('names the path when the fixture is missing', () => {
    expect(() => readScreen('no_such_screen')).toThrow(
      /snapshots__no_such_screen\.snap/,
    )
  })

  it('refuses a name that is not a fixture name', () => {
    expect(() => readScreen('../../secrets')).toThrow(/is not a fixture name/)
  })
})

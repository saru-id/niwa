import { describe, expect, test, vi } from 'vitest'

import { luau, tokenize } from './luau'

/** The tokens a source yields, as `class:text` pairs, in source order. */
function classed(code: string): Array<string> {
  return tokenize(code).map(
    (range) => `${range.className}:${code.slice(range.start, range.end)}`,
  )
}

describe('the Luau grammar', () => {
  test('registers under both names the site writes', () => {
    expect(luau.name).toBe('luau')
    expect(luau.aliases).toEqual(['lua'])
  })

  test('colours keywords, literals and operators', () => {
    expect(classed('local ok = true and not false')).toEqual([
      'keyword:local',
      'operator:=',
      'literal:true',
      'keyword:and',
      'keyword:not',
      'literal:false',
    ])
  })

  test('takes a long bracket string at its own level', () => {
    const code = 'local text = [=[a ]] b]=]\nlocal after = 1'
    expect(classed(code)).toEqual([
      'keyword:local',
      'operator:=',
      'string:[=[a ]] b]=]',
      'keyword:local',
      'operator:=',
      'number:1',
    ])
  })

  test('takes quoted and interpolated strings', () => {
    expect(classed('f("a", \'b\', `c {d}`)')).toEqual([
      'function:f',
      'string:"a"',
      "string:'b'",
      'string:`c {d}`',
    ])
  })

  test('takes comments, and an apostrophe inside one opens nothing', () => {
    expect(classed("-- don't count on it\nlocal a = 1")).toEqual([
      "comment:-- don't count on it",
      'keyword:local',
      'operator:=',
      'number:1',
    ])
  })

  test('takes a long comment and the strict mode line before it', () => {
    expect(classed('--!strict\n--[==[ note ]] more ]==]')).toEqual([
      'meta:--!strict',
      'comment:--[==[ note ]] more ]==]',
    ])
  })

  test('colours numbers but leaves digits inside identifiers alone', () => {
    expect(classed('local n1 = 0xFF_00 + 1_000.5e-3')).toEqual([
      'keyword:local',
      'operator:=',
      'number:0xFF_00',
      'operator:+',
      'number:1_000.5e-3',
    ])
    expect(classed('sha256 utf8 arm64 id_ed25519')).toEqual([])
  })

  test('colours a field named like a keyword as a field', () => {
    expect(classed('local kind = obj.type')).toEqual([
      'keyword:local',
      'operator:=',
      'property:type',
    ])
  })

  test('leaves a table key named like a keyword alone', () => {
    expect(classed('local step = { type = "formula", mode = "600" }')).toEqual([
      'keyword:local',
      'operator:=',
      'operator:=',
      'string:"formula"',
      'operator:=',
      'string:"600"',
    ])
  })

  test('still colours a type alias', () => {
    expect(classed('export type Kind = string')).toEqual([
      'keyword:export',
      'keyword:type',
      'operator:=',
    ])
  })

  test('colours a called field as a call', () => {
    expect(classed('niwa.brew.formula("ripgrep")')).toEqual([
      'property:brew',
      'function:formula',
      'string:"ripgrep"',
    ])
  })

  test('gives every tokenization its own regex', () => {
    // A `g`-flagged regex carries its scan position. A shared one would let
    // a nested tokenization rewind the scan that called it, so no two calls
    // may see the same instance.
    const scanners = new Set<RegExp>()
    const exec = RegExp.prototype.exec
    const spy = vi
      .spyOn(RegExp.prototype, 'exec')
      .mockImplementation(function (this: RegExp, code: string) {
        scanners.add(this)
        return exec.call(this, code)
      })

    tokenize('local a = 1')
    tokenize('local b = 2')
    spy.mockRestore()

    expect(scanners.size).toBe(2)
  })

  test('gives the same answer whatever ran before it', () => {
    const first = classed('local a = "one"')
    tokenize('--[==[ a long unterminated-looking comment ]==] local b = 2')
    expect(classed('local a = "one"')).toEqual(first)
  })
})

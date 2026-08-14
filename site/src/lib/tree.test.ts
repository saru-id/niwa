import { describe, expect, test } from 'vitest'

import { CONFIG_REPO_ORDER, prepareTree, readTree } from './tree'

/** The example config repo, read from the tool's own fixture. */
const example = readTree('tests/fixtures/example')

describe('reading a structure from the repository', () => {
  test('reads the example config repo whole', () => {
    const paths = example.map((entry) => entry.path)
    expect(paths).toContain('init.luau')
    expect(paths).toContain('.luaurc')
    expect(paths).toContain('files/bin/notes-sync')
    expect(paths).toContain('secrets/github-token.age')
  })

  test('marks directories with a trailing slash', () => {
    const paths = example.map((entry) => entry.path)
    expect(paths).toContain('files/')
    expect(paths).toContain('files/bin/')
  })

  test('says what to do when the directory is not there', () => {
    expect(() => readTree('tests/fixtures/no-such-thing')).toThrow(
      /No such directory sits above/,
    )
  })
})

describe('the declared top-level order', () => {
  test('names every top level of the example repo and nothing else', () => {
    const top = new Set(
      example.map((entry) => entry.path.replace(/\/$/, '').split('/')[0] ?? ''),
    )
    expect([...top].sort()).toEqual([...CONFIG_REPO_ORDER].sort())
  })

  test('puts the config repo in reading order, not the alphabet', () => {
    const { paths } = prepareTree(example)
    const top = paths.filter((path) => !path.slice(0, -1).includes('/'))
    expect(top).toEqual([
      'init.luau',
      '.luaurc',
      'niwa.lock',
      'modules/',
      'hosts/',
      'files/',
      'secrets/',
      'state/',
    ])
  })
})

describe('preparing a tree', () => {
  test('walks depth first, directories before files, then by name', () => {
    const { paths } = prepareTree(
      [
        { path: 'b.txt' },
        { path: 'a/two.txt' },
        { path: 'a/one.txt' },
        { path: 'a/deep/x.txt' },
      ],
      [],
    )
    expect(paths).toEqual(['a/', 'a/deep/', 'a/deep/x.txt', 'a/one.txt', 'a/two.txt', 'b.txt'])
  })

  test('keeps a directory that holds nothing', () => {
    const { paths, rowCount } = prepareTree([{ path: 'state/' }, { path: 'init.luau' }])
    expect(paths).toEqual(['init.luau', 'state/'])
    expect(rowCount).toBe(2)
  })

  test('counts one row per path, directories included', () => {
    const tree = prepareTree(example)
    expect(tree.rowCount).toBe(tree.paths.length)
    expect(tree.rows.map((row) => row.path)).toEqual(tree.paths)
  })

  test('draws the last child of a level with an elbow and the rest with tees', () => {
    const { rows } = prepareTree([
      { path: 'init.luau' },
      { path: 'modules/cli.luau' },
      { path: 'modules/shell.luau' },
    ])
    expect(rows.map((row) => `${row.prefix}${row.name}`)).toEqual([
      '├─ init.luau',
      '└─ modules/',
      '   ├─ cli.luau',
      '   └─ shell.luau',
    ])
  })

  test('carries a bar down every level that still has siblings below it', () => {
    const { rows } = prepareTree([{ path: 'modules/cli.luau' }, { path: 'init.luau' }])
    // `modules/` is drawn before `init.luau` by the declared order, so the
    // branch continues past its child and the child's line keeps the bar.
    expect(rows.map((row) => `${row.prefix}${row.name}`)).toEqual([
      '├─ init.luau',
      '└─ modules/',
      '   └─ cli.luau',
    ])
  })

  test('puts each note on its own row rather than in a list below', () => {
    const { rows } = prepareTree([
      { path: 'init.luau', note: 'The one file niwa reads first.' },
      { path: 'modules/' },
    ])
    expect(rows.map((row) => [row.name, row.note])).toEqual([
      ['init.luau', 'The one file niwa reads first.'],
      ['modules/', undefined],
    ])
  })

  test('returns notes in tree order and never inside the tree', () => {
    const { paths, notes } = prepareTree([
      { path: 'modules/', note: 'What a machine can be told to do.' },
      { path: 'init.luau', note: 'The one file niwa reads first.' },
    ])
    expect(notes.map((entry) => entry.note)).toEqual([
      'The one file niwa reads first.',
      'What a machine can be told to do.',
    ])
    expect(notes.map((entry) => entry.path)).toEqual(paths)
  })
})

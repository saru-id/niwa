import { describe, expect, it } from 'vitest'
import { measure } from '../lib/table'

// The floor's whole job is the identifier a reader must be able to read. The
// share is an estimate and may sample; the floor may not, because the longest
// name in a reference table can sit on any row.

describe('measure', () => {
  it('floors a column on an identifier past the sampled rows', () => {
    const filler = Array.from({ length: 6 }, (_, i) => [`v${i}`, 'short'])
    const rows = [...filler, ['NIWA_PROGRESS_EVERY', 'longer prose here']]
    const { columns } = measure(['Name', 'Meaning'], rows)
    // 19 characters at 9px plus the cell's 16px of inline air.
    expect(columns[0]?.minWidth).toBe(`${19 * 9 + 16}px`)
  })

  it('floors a short column at the shared minimum', () => {
    const { columns } = measure(['Code', 'When'], [['0', 'Every step succeeded']])
    expect(columns[0]?.minWidth).toBe('60px')
  })

  it('holds the table where the widest column clears its floor', () => {
    const rows = [['--no-privileged', 'Skip the steps that need administrator rights']]
    const { columns, table } = measure(['Flag', 'Meaning'], rows)
    // Flag: longest word 15 chars -> floor 151px, two shares of five.
    expect(columns[0]?.minWidth).toBe('151px')
    expect(table).toBe(`${(151 * 5) / 2}px`)
  })
})

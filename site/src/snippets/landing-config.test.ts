import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/* The landing shows this config beside the plan it produces. The tool's own
 * snapshot test writes the same config and locks the screen, so the pair is
 * one exhibit. That claim is only true while the two texts agree, and this
 * is where they are compared.
 *
 * The comparison reads tests/snapshots.rs, not the .snap file. A .snap holds
 * the screen, never the config that produced it; the config lives in the
 * fixture function the test calls.
 */

const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8')

const SNIPPET = read('./landing-config.luau')
const RUST = read('../../../tests/snapshots.rs')
const SNAP = read('../../../tests/snapshots/snapshots__plan_mixed_pending_color.snap')

const SNAPSHOT = 'plan_mixed_pending_color'
const FIXTURE = 'mixed_pending_home'

/** The init.luau the named fixture function writes, as it writes it. */
function fixtureConfig(): string {
  const start = RUST.indexOf(`fn ${FIXTURE}(`)
  expect(start, `${FIXTURE} is gone from tests/snapshots.rs`).toBeGreaterThan(-1)
  const open = RUST.indexOf('r#"', start)
  expect(open, `${FIXTURE} no longer writes a raw string`).toBeGreaterThan(-1)
  const close = RUST.indexOf('"#', open)
  expect(close).toBeGreaterThan(open)
  // The string must be the one written as init.luau, not some other file
  // the fixture might also write.
  expect(RUST.slice(start, open), `${FIXTURE} does not write init.luau`).toContain('init.luau')
  return RUST.slice(open + 'r#"'.length, close)
}

describe('the landing config', () => {
  it('is the config the plan snapshot renders from, byte for byte', () => {
    expect(SNIPPET).toBe(fixtureConfig())
  })

  it('produces the screen the landing shows beside it', () => {
    const named = RUST.indexOf(`insta::assert_snapshot!("${SNAPSHOT}"`)
    expect(named, `${SNAPSHOT} is gone from tests/snapshots.rs`).toBeGreaterThan(-1)
    const test = RUST.slice(RUST.lastIndexOf('\nfn ', named), named)
    expect(test).toContain(`${FIXTURE}()`)
    // The screen the fixture renders carries the config's own rows; their
  // presence is what binds the snapshot to this config rather than another.
  expect(SNAP).toContain('brew.formula:fd')
  expect(SNAP).toContain('~/.zshrc')
  expect(SNAP).toContain('~/.config/nvim')
  })
})

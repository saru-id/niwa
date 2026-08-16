/* The hero art, sampled onto the grid the water reads it on.
 *
 * Two readings of one 384 by 256 grid: one of the source raster, one of the
 * AVIF a wide viewport loads. The pair is what `water.test.ts` measures the
 * encode against, and it is kept here so the test needs no image decoder and
 * no browser.
 *
 * Only the windows below are kept. The whole grid is four times these bytes
 * and the water is never asked about the rest of the art.
 *
 * To write them again: sample both images to 384 by 256, filling the grid
 * rather than fitting the art inside it, with a linear kernel — the closest
 * match to the reduction a canvas does — and copy each window out as raw
 * RGBA rows, windows in the order below, source and encode into their own
 * file. The encode is the build's own quality 60 AVIF of
 * `src/assets/art/garden.png`, which `lib/hero-art.ts` pins.
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

/** The grid the windows were cut from. */
export const GRID_WIDTH = 384
export const GRID_HEIGHT = 256

/** A rectangle of the grid, kept whole. */
export interface SampleWindow {
  readonly name: WindowName
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

export type WindowName =
  | 'pond'
  | 'sunken-stone'
  | 'left-boulders'
  | 'lower-boulder'
  | 'stepping-stones'

/**
 * The windows, in the order the files hold them.
 *
 * `pond` is the smallest box that holds every sample inside the pond outline.
 * The other four are stone: the sunken stone the pond covers at its foot, the
 * boulders on its left, the boulder below it, and the stones stepping across
 * on its right. Each was drawn on the full art and cut back to the samples
 * whose whole four by four footprint lands inside it, so no sample in them
 * carries any water.
 */
export const WINDOWS: readonly SampleWindow[] = [
  { name: 'pond', left: 131, top: 149, width: 100, height: 90 },
  { name: 'sunken-stone', left: 200, top: 206, width: 19, height: 11 },
  { name: 'left-boulders', left: 70, top: 168, width: 47, height: 32 },
  { name: 'lower-boulder', left: 203, top: 229, width: 32, height: 11 },
  { name: 'stepping-stones', left: 244, top: 154, width: 36, height: 18 },
]

/** Which of the two readings a window is taken from. */
export type Encode = 'source' | 'encoded'

/** One window's samples, and where a grid coordinate sits inside them. */
export interface Samples {
  readonly window: SampleWindow
  readonly bytes: Uint8Array
  /** The offset of the sample at a grid coordinate, red first. */
  at(x: number, y: number): number
}

/**
 * Each file, and the digest of the bytes the measurements below were taken
 * from.
 *
 * The table and the bytes are one fixture kept in three files, and a test that
 * reads bytes no measurement was taken from proves nothing. The length catches
 * a file written from a different table; the digest catches a file written
 * from a different image, or a different quality, at the same shape.
 */
const FILES: Record<Encode, { readonly path: string; readonly sha256: string }> =
  {
    source: {
      path: './water-samples-source.bin',
      sha256:
        '470d3e921fd41d4d908cce649526370d1d25a02587fd10f9f52d2f61dd6f4fe4',
    },
    encoded: {
      path: './water-samples-encoded.bin',
      sha256:
        'ccd7735413b1b4646a2382e720e1b46fd8c2dc740deeb1b756960a874fb2b76b',
    },
  }

const held = new Map<Encode, Uint8Array>()

function file(encode: Encode): Uint8Array {
  const already = held.get(encode)

  if (already) return already

  const { path, sha256 } = FILES[encode]
  const bytes = readFileSync(new URL(path, import.meta.url))
  const expected =
    WINDOWS.reduce((total, window) => total + window.width * window.height, 0) *
    4

  if (bytes.length !== expected) {
    throw new Error(
      `${path} holds ${bytes.length} bytes, and the windows describe ${expected}`,
    )
  }

  const digest = createHash('sha256').update(bytes).digest('hex')

  if (digest !== sha256) {
    throw new Error(`${path} digests ${digest}, and the fixture is ${sha256}`)
  }

  held.set(encode, bytes)

  return bytes
}

/** One window of one reading, ready to be walked. */
export function readWindow(encode: Encode, name: WindowName): Samples {
  const bytes = file(encode)
  let start = 0
  let found: SampleWindow | null = null

  for (const window of WINDOWS) {
    if (window.name === name) {
      found = window
      break
    }

    start += window.width * window.height * 4
  }

  if (!found) throw new Error(`no window named ${name}`)

  const window = found

  return {
    window,
    bytes,
    at(x: number, y: number): number {
      return start + ((y - window.top) * window.width + (x - window.left)) * 4
    },
  }
}

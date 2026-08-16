import { describe, expect, test } from 'vitest'

import {
  GRID_HEIGHT,
  GRID_WIDTH,
  readWindow,
  type Encode,
  type WindowName,
} from './__fixtures__/water-samples'
import {
  isMaskColor,
  isWaterColor,
  maskAlpha,
  pointInPond,
  SAMPLE_HEIGHT,
  SAMPLE_WIDTH,
} from './water'

/** What the pointer's reading says about one sample. */
const OUTSIDE = -1
const DRY = 0
const WET = 1

/** The pointer's verdict for every sample the pond window holds. */
function verdicts(encode: Encode): Int8Array {
  const samples = readWindow(encode, 'pond')
  const { window, bytes } = samples
  const map = new Int8Array(window.width * window.height).fill(OUTSIDE)

  for (let row = 0; row < window.height; row += 1) {
    for (let column = 0; column < window.width; column += 1) {
      const x = window.left + column
      const y = window.top + row

      if (!pointInPond(x / SAMPLE_WIDTH, y / SAMPLE_HEIGHT)) continue

      const at = samples.at(x, y)

      map[row * window.width + column] = isWaterColor(
        bytes[at],
        bytes[at + 1],
        bytes[at + 2],
        bytes[at + 3],
      )
        ? WET
        : DRY
    }
  }

  return map
}

describe('the fixture', () => {
  test('was cut on the grid the water reads', () => {
    expect(GRID_WIDTH).toBe(SAMPLE_WIDTH)
    expect(GRID_HEIGHT).toBe(SAMPLE_HEIGHT)
  })

  test('holds the whole pond', () => {
    // Every sample inside the outline falls inside the window, so the walk
    // below sees the pond and nothing is cropped out of the count.
    const { window } = readWindow('source', 'pond')
    let outside = 0

    for (let y = 0; y < SAMPLE_HEIGHT; y += 1) {
      for (let x = 0; x < SAMPLE_WIDTH; x += 1) {
        if (!pointInPond(x / SAMPLE_WIDTH, y / SAMPLE_HEIGHT)) continue
        if (
          x < window.left ||
          y < window.top ||
          x >= window.left + window.width ||
          y >= window.top + window.height
        ) {
          outside += 1
        }
      }
    }

    expect(outside).toBe(0)
  })
})

/* The encode a wide viewport loads still reads as water.
 *
 * The hero is served as AVIF, and the ripples ask the pixels the browser
 * decoded, not the raster the art was drawn as. A quality step that keeps the
 * picture can still move the color of the water past a threshold, so the two
 * readings are compared sample by sample.
 *
 * Disagreements are split the way they matter. A sample that flips where the
 * source has the other verdict within one sample of it is the water's edge
 * moving, which nobody sees. A sample that flips with no such neighbor is a
 * hole or an island in open water, which is behavior drifting.
 */
describe('the water the wide viewport loads', () => {
  const { window } = readWindow('source', 'pond')
  const source = verdicts('source')
  const encoded = verdicts('encoded')

  const nearby = (map: Int8Array, column: number, row: number, verdict: number) => {
    for (let down = -1; down <= 1; down += 1) {
      for (let across = -1; across <= 1; across += 1) {
        if (down === 0 && across === 0) continue

        const r = row + down
        const c = column + across

        if (r < 0 || c < 0 || r >= window.height || c >= window.width) continue
        if (map[r * window.width + c] === verdict) return true
      }
    }

    return false
  }

  let sampled = 0
  let agreed = 0
  let moved = 0
  let flipped = 0

  for (let row = 0; row < window.height; row += 1) {
    for (let column = 0; column < window.width; column += 1) {
      const at = row * window.width + column

      if (source[at] === OUTSIDE) continue

      sampled += 1

      if (source[at] === encoded[at]) {
        agreed += 1
        continue
      }

      if (nearby(source, column, row, encoded[at])) moved += 1
      else flipped += 1
    }
  }

  test('is asked about the whole pond', () => {
    expect(sampled).toBe(6786)
  })

  test('agrees with the source outside a sample of the edge', () => {
    expect((agreed + moved) / sampled).toBeGreaterThanOrEqual(0.99)
  })

  test('opens no hole and no island in the open water', () => {
    expect(flipped / sampled).toBeLessThanOrEqual(0.0025)
  })
})

/* The mask keeps off the stone around the pond.
 *
 * Two things hold it off, and they are measured apart, because one of them
 * does nearly all of the work and would otherwise hide the other.
 *
 * The pond's outline is the first. The build cuts the mask to it before it
 * reads a single pixel, so stone outside the pond is never asked about. That
 * matters: the color test alone would take the stone. The boulders on the
 * pond's left are wet and mossy, and more than one sample in ten of the stone
 * outside the outline reads as water on color alone.
 *
 * The color test is the second, and it only ever answers about the stone the
 * outline does cover — here, the stone sunk at the pond's foot. It is measured
 * over that stone's own covered samples. Measuring it over every window would
 * put 2,504 samples the outline already answered into the denominator and hide
 * the reading it is meant to be.
 *
 * The build cuts with the curve and this reads the polygon. Measured over the
 * grid, the two part on 402 of the pond's 6,786 samples: a thread along the
 * outline, at its widest where 22 samples of one row lie between them at the
 * top edge. None of that thread reaches the three windows the outline holds
 * the mask off. The one window it reaches is the sunken stone, on 12 of its
 * 209 samples at the stone's fringe, and the reading survives it: the polygon
 * covers 191 of the window and marks 1, the curve covers 203 and marks 2, both
 * inside the bound below.
 */
describe('the mask over the stone around the pond', () => {
  /** Stone the pond's outline does not reach. */
  const BEYOND: readonly WindowName[] = [
    'left-boulders',
    'lower-boulder',
    'stepping-stones',
  ]
  /** Stone the outline covers, where the color test is the only guard left. */
  const COVERED: readonly WindowName[] = ['sunken-stone']

  const count = (encode: Encode, names: readonly WindowName[]) => {
    let total = 0
    let covered = 0
    let marked = 0
    let colored = 0

    for (const name of names) {
      const samples = readWindow(encode, name)
      const { window, bytes } = samples

      for (let row = 0; row < window.height; row += 1) {
        for (let column = 0; column < window.width; column += 1) {
          const x = window.left + column
          const y = window.top + row
          const at = samples.at(x, y)
          const water =
            maskAlpha(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]) > 0

          total += 1

          if (water) colored += 1
          if (!pointInPond(x / SAMPLE_WIDTH, y / SAMPLE_HEIGHT)) continue

          covered += 1

          if (water) marked += 1
        }
      }
    }

    return { total, covered, marked, colored }
  }

  test('samples every window of stone', () => {
    expect(count('source', [...BEYOND, ...COVERED]).total).toBe(2713)
  })

  test.each<Encode>(['source', 'encoded'])(
    'is held off the stone beyond the pond by the outline, in the %s',
    (encode) => {
      const { total, covered, marked, colored } = count(encode, BEYOND)

      expect(total).toBe(2504)
      expect(covered).toBe(0)
      expect(marked).toBe(0)
      // And the outline is what did it. On color alone this stone would take
      // hundreds of samples, so an outline that grew over it would show here.
      expect(colored).toBeGreaterThan(200)
    },
  )

  test.each<Encode>(['source', 'encoded'])(
    'marks almost none of the stone it covers, in the %s',
    (encode) => {
      const { covered, marked } = count(encode, COVERED)

      expect(covered).toBe(191)
      // One covered sample is the stone's own rim, where the four art pixels
      // behind it are part water: 0.53% of the window. The nearest loosening
      // measured on this stone — dropping the test that blue holds most of
      // green — takes 12% of it. The bound sits between them, near the one
      // mixed sample it has to admit rather than near the loosening.
      expect(marked / covered).toBeLessThan(0.02)
    },
  )
})

/* The two readings, on the thresholds where they part.
 *
 * Every row below sits one count either side of a threshold. The four ratio
 * tests and the contrast are shared, so both readings answer them the same.
 * Alpha and the blue floor are not, and each is where one reading takes a
 * color the other refuses.
 */
describe('the two readings of a color', () => {
  test('agree on open water', () => {
    expect(isWaterColor(40, 70, 90, 200)).toBe(true)
    expect(isMaskColor(40, 70, 90, 200)).toBe(true)
  })

  test('part on alpha, between 28 and 48', () => {
    // The mask takes a color the pond curve cut down to a quarter opaque; the
    // pointer wants a pixel that is really there.
    expect(isMaskColor(40, 70, 90, 28)).toBe(false)
    expect(isWaterColor(40, 70, 90, 28)).toBe(false)

    expect(isMaskColor(40, 70, 90, 29)).toBe(true)
    expect(isWaterColor(40, 70, 90, 29)).toBe(false)

    expect(isMaskColor(40, 70, 90, 48)).toBe(true)
    expect(isWaterColor(40, 70, 90, 48)).toBe(false)

    expect(isMaskColor(40, 70, 90, 49)).toBe(true)
    expect(isWaterColor(40, 70, 90, 49)).toBe(true)
  })

  test('part on the blue floor', () => {
    // Dark and cool holds every ratio. Only the mask asks how much blue is
    // actually there.
    expect(isWaterColor(0, 40, 46, 200)).toBe(true)
    expect(isMaskColor(0, 40, 46, 200)).toBe(false)

    expect(isWaterColor(0, 40, 47, 200)).toBe(true)
    expect(isMaskColor(0, 40, 47, 200)).toBe(true)
  })

  test('agree that green has to lead red', () => {
    expect(isWaterColor(100, 106, 130, 200)).toBe(false)
    expect(isMaskColor(100, 106, 130, 200)).toBe(false)

    expect(isWaterColor(100, 107, 130, 200)).toBe(true)
    expect(isMaskColor(100, 107, 130, 200)).toBe(true)
  })

  test('agree that blue has to lead red further', () => {
    expect(isWaterColor(100, 120, 112, 200)).toBe(false)
    expect(isMaskColor(100, 120, 112, 200)).toBe(false)

    expect(isWaterColor(100, 120, 113, 200)).toBe(true)
    expect(isMaskColor(100, 120, 113, 200)).toBe(true)
  })

  test('agree that blue has to hold most of green', () => {
    expect(isWaterColor(0, 100, 89, 200)).toBe(false)
    expect(isMaskColor(0, 100, 89, 200)).toBe(false)

    expect(isWaterColor(0, 100, 91, 200)).toBe(true)
    expect(isMaskColor(0, 100, 91, 200)).toBe(true)
  })

  test('agree on the cool contrast', () => {
    expect(isWaterColor(100, 110, 122, 200)).toBe(false)
    expect(isMaskColor(100, 110, 122, 200)).toBe(false)

    expect(isWaterColor(100, 110, 123, 200)).toBe(true)
    expect(isMaskColor(100, 110, 123, 200)).toBe(true)
  })
})

describe('the mask alpha', () => {
  test('is nothing where the color is not water', () => {
    expect(maskAlpha(100, 110, 122, 200)).toBe(0)
    expect(maskAlpha(0, 40, 46, 200)).toBe(0)
  })

  test('holds a barely cool color back to 78%', () => {
    // One count of contrast past the threshold.
    expect(maskAlpha(100, 110, 123, 255)).toBe(202)
  })

  test('reaches the whole alpha 85 counts of contrast later', () => {
    expect(maskAlpha(100, 120, 131, 255)).toBe(255)
    expect(maskAlpha(40, 70, 90, 200)).toBe(200)
  })

  test('carries the alpha it was given', () => {
    expect(maskAlpha(100, 110, 123, 128)).toBe(101)
  })
})

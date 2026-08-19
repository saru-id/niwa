import { describe, expect, test } from 'vitest'

import { computeScene, LANDING_QUERY, type Effect, type Rect, type Scene } from './geometry'

/** The hero art's own pixel size. */
const ART = { w: 1536, h: 1024 }

const expectRect = (rect: Rect, expected: Rect) => {
  expect(rect.left).toBeCloseTo(expected.left, 2)
  expect(rect.top).toBeCloseTo(expected.top, 2)
  expect(rect.width).toBeCloseTo(expected.width, 2)
  expect(rect.height).toBeCloseTo(expected.height, 2)
}

/** Normalized art coordinates to the canvas, the conversion `frame` defines. */
const toCanvas = (frame: Rect, nx: number, ny: number) => ({
  x: frame.left + nx * frame.width,
  y: frame.top + ny * frame.height,
})

/** The same conversion read backwards, the direction a pointer takes. */
const toNormalized = (frame: Rect, x: number, y: number) => ({
  nx: (x - frame.left) / frame.width,
  ny: (y - frame.top) / frame.height,
})

describe('the contained scene', () => {
  // The art wrap is 88% of a 1536 pixel viewport, as the browser measures it,
  // and one viewport tall.
  const wrap: Rect = {
    left: 184.328125,
    top: 0,
    width: 1351.671875,
    height: 1024,
  }
  const scene = computeScene(wrap, ART, false, 1)

  test('fits the art to the wrap width and sits it on the bottom edge', () => {
    expectRect(scene.canvas, {
      left: 0,
      top: 122.89,
      width: 1351.67,
      height: 901.11,
    })
  })

  test('places the canvas where the art is on the page', () => {
    expect(wrap.left + scene.canvas.left).toBeCloseTo(184.33, 2)
    expect(wrap.top + scene.canvas.top).toBeCloseTo(122.89, 2)
  })

  test('fills the canvas with the frame, at the canvas origin', () => {
    expectRect(scene.frame, { left: 0, top: 0, width: 1351.67, height: 901.11 })
    expect(scene.frame.left).toBe(0)
    expect(scene.frame.top).toBe(0)
    expect(scene.frame.width).toBe(scene.canvas.width)
    expect(scene.frame.height).toBe(scene.canvas.height)
  })

  test('keeps the art whole in a wrap wider than the art', () => {
    // A 1920 by 900 viewport: the height runs out first, so the width no
    // longer reaches the wrap's edge and the art hangs on the right.
    const wide = computeScene(
      { left: 230.4, top: 0, width: 1689.6, height: 900 },
      ART,
      false,
      1,
    )
    expectRect(wide.canvas, {
      left: 339.6,
      top: 0,
      width: 1350,
      height: 900,
    })
    expectRect(wide.frame, { left: 0, top: 0, width: 1350, height: 900 })
  })

  test('reports the desktop scene', () => {
    expect(scene.covered).toBe(false)
  })
})

describe('the covering scene', () => {
  const wrap: Rect = { left: 0, top: 0, width: 390, height: 844 }
  const scene = computeScene(wrap, ART, true, 1)

  test('gives the canvas the whole wrap', () => {
    expectRect(scene.canvas, { left: 0, top: 0, width: 390, height: 844 })
    expect(scene.covered).toBe(true)
  })

  test('overflows the canvas sideways, held at 65% across', () => {
    expectRect(scene.frame, {
      left: -569.4,
      top: 0,
      width: 1266,
      height: 844,
    })
  })

  test('overflows downwards where the wrap is the wider shape', () => {
    // A phone held sideways is still under the breakpoint, and there the
    // width is what runs short: the frame is taller than the canvas, the top
    // is negative, and the 65% has no overflow left to move.
    const landscape = computeScene(
      { left: 0, top: 0, width: 667, height: 375 },
      ART,
      true,
      1,
    )
    expectRect(landscape.canvas, { left: 0, top: 0, width: 667, height: 375 })
    expectRect(landscape.frame, {
      left: 0,
      top: -34.83,
      width: 667,
      height: 444.67,
    })
  })
})

describe('the backing store density', () => {
  const density = (covered: boolean, dpr: number) =>
    computeScene({ left: 0, top: 0, width: 390, height: 844 }, ART, covered, dpr)
      .density

  test('caps the covered composition at 1.25', () => {
    expect(density(true, 1)).toBe(1)
    expect(density(true, 1.75)).toBe(1.25)
    expect(density(true, 2)).toBe(1.25)
    expect(density(true, 3)).toBe(1.25)
  })

  test('caps the contained composition at 2', () => {
    expect(density(false, 1)).toBe(1)
    expect(density(false, 1.75)).toBe(1.75)
    expect(density(false, 2)).toBe(2)
    expect(density(false, 3)).toBe(2)
  })

  test('draws on a screen that reports no ratio', () => {
    expect(density(true, 0)).toBe(1)
    expect(density(false, 0)).toBe(1)
  })
})

describe('normalized art coordinates', () => {
  const contained = computeScene(
    { left: 184.328125, top: 0, width: 1351.671875, height: 1024 },
    ART,
    false,
    1,
  )
  const covering = computeScene(
    { left: 0, top: 0, width: 390, height: 844 },
    ART,
    true,
    1,
  )

  test('spans the canvas where the art is contained', () => {
    expect(toCanvas(contained.frame, 0, 0)).toEqual({ x: 0, y: 0 })
    const end = toCanvas(contained.frame, 1, 1)
    expect(end.x).toBeCloseTo(contained.canvas.width, 6)
    expect(end.y).toBeCloseTo(contained.canvas.height, 6)
  })

  test('holds the art left of the canvas where the art covers', () => {
    // The middle of the art is not the middle of the phone's screen: the 65%
    // keeps the basin in view by pushing the art's center to the left.
    const middle = toCanvas(covering.frame, 0.5, 0.5)
    expect(middle.x).toBeCloseTo(63.6, 2)
    expect(middle.y).toBeCloseTo(422, 2)
    expect(middle.x).toBeLessThan(covering.canvas.width / 2)
  })

  test('round trips, in range and out of it', () => {
    for (const scene of [contained, covering]) {
      for (const nx of [-0.2, 0, 0.4498, 1, 1.4]) {
        for (const ny of [-0.35, 0, 0.462, 1, 2.1]) {
          const point = toCanvas(scene.frame, nx, ny)
          const back = toNormalized(scene.frame, point.x, point.y)
          expect(back.nx).toBeCloseTo(nx, 9)
          expect(back.ny).toBeCloseTo(ny, 9)
        }
      }
    }
  })

  test('reads outside 0 to 1 for a pointer off the art', () => {
    const above = toNormalized(contained.frame, -50, -50)
    expect(above.nx).toBeLessThan(0)
    expect(above.ny).toBeLessThan(0)
    const past = toNormalized(
      contained.frame,
      contained.canvas.width + 40,
      contained.canvas.height + 40,
    )
    expect(past.nx).toBeGreaterThan(1)
    expect(past.ny).toBeGreaterThan(1)
  })
})

describe('the landing breakpoint', () => {
  test('is the bare condition matchMedia takes', () => {
    expect(LANDING_QUERY).toBe('(max-width: 780px), (max-aspect-ratio: 1/1)')
    expect(LANDING_QUERY.startsWith('@media')).toBe(false)
  })

  // Either term alone puts a screen in the covered composition, which is why
  // they are joined by a comma and not by `and`. The width catches the phone
  // and the aspect ratio the tablet held upright, and a phone held upright
  // answers to both.
  test('takes either the phone or the upright screen', () => {
    const terms = LANDING_QUERY.split(', ')
    expect(terms).toHaveLength(2)
    expect(terms[0]).toBe('(max-width: 780px)')
    expect(terms[1]).toBe('(max-aspect-ratio: 1/1)')
  })
})


// The seam itself: a conforming effect must satisfy the interface exactly.
// The stub is the type check; a signature change here is a change every
// effect module feels, and this is where it fails first.
const conforming: Effect = {
  init(_image: HTMLImageElement, _scene: Scene): void {},
  resize(_scene: Scene): void {},
  draw(_context: CanvasRenderingContext2D, _scene: Scene, _now: number): boolean {
    return false
  },
  pointer(_nx: number, _ny: number, _kind: 'move' | 'down' | 'leave'): void {},
  dispose(): void {},
}

describe('the effect contract', () => {
  test('is satisfiable, and a resting effect answers false', () => {
    const scene = computeScene({ left: 0, top: 0, width: 100, height: 100 }, ART, false, 1)
    expect(conforming.draw(null as unknown as CanvasRenderingContext2D, scene, 0)).toBe(false)
  })
})

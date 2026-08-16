import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { computeScene, type Scene } from './geometry'
import { createRipples } from './ripples'
import { SAMPLE_HEIGHT, SAMPLE_WIDTH } from './water'

/* Ripples read the art through a canvas and paint onto another one, and a
 * test runner has neither. What follows is the smallest host the module
 * actually uses: a path that holds nothing, a canvas whose pixels all read as
 * open water, and a drawing context that records what was asked of it and the
 * ink it was asked with.
 *
 * With every sample reading as water, the pond's own outline is what decides
 * where a ring may be struck. Which colors are water is measured against the
 * art itself in `water.test.ts`, not here.
 *
 * Every ring is given the same life and reach: the spread each carries is a
 * random number, and it is held at one end so a drawn ring can be predicted
 * exactly. The tests that pin the spread take the other end.
 */

const OPEN_WATER = [40, 70, 90, 200]

/** A gradient the module built, standing in for the browser's own. */
interface Gradient {
  readonly kind: 'linear'
  /** The two ends it runs between. */
  readonly from: readonly [number, number]
  readonly to: readonly [number, number]
  readonly stops: readonly (readonly [number, string])[]
}

interface Call {
  readonly name: string
  readonly args: readonly unknown[]
  /** The state in force when the call was made. */
  readonly composite: string
  readonly strokeStyle: string | Gradient
  readonly lineWidth: number
  readonly alpha: number
}

function recorder() {
  const calls: Call[] = []
  let composite = 'source-over'
  let strokeStyle: string | Gradient = ''
  let lineWidth = 0
  let alpha = 1
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push({ name, args, composite, strokeStyle, lineWidth, alpha })
    }
  const context = {
    save: record('save'),
    restore: record('restore'),
    translate: record('translate'),
    clip: record('clip'),
    beginPath: record('beginPath'),
    ellipse: record('ellipse'),
    stroke: record('stroke'),
    drawImage: record('drawImage'),
    setTransform: record('setTransform'),
    // A crest is stroked with a gradient laid across the ring, so the ink a
    // test reads is an object rather than a color string. This stands in for
    // the browser's, holding what the module asked for.
    createLinearGradient(x0: number, y0: number, x1: number, y1: number) {
      const stops: (readonly [number, string])[] = []

      return {
        kind: 'linear' as const,
        from: [x0, y0] as const,
        to: [x1, y1] as const,
        stops,
        addColorStop(offset: number, color: string) {
          stops.push([offset, color] as const)
        },
      }
    },
    get globalCompositeOperation() {
      return composite
    },
    set globalCompositeOperation(value: string) {
      composite = value
    },
    get strokeStyle() {
      return strokeStyle
    },
    set strokeStyle(value: string | Gradient) {
      strokeStyle = value
    },
    get lineWidth() {
      return lineWidth
    },
    set lineWidth(value: number) {
      lineWidth = value
    },
    // The crest's own strength rides here rather than in the ink, so one
    // gradient can serve every ring in a train.
    get globalAlpha() {
      return alpha
    },
    set globalAlpha(value: number) {
      alpha = value
    },
  }

  return { calls, context: context as unknown as CanvasRenderingContext2D }
}

function fakeCanvas() {
  // An image with no pixels of its own draws nothing, the way a browser
  // treats one that never decoded, and the canvas is then still empty.
  let painted = false

  return {
    width: 0,
    height: 0,
    getContext: () => ({
      clearRect: () => {},
      drawImage: (image: { naturalWidth?: number }) => {
        if (image.naturalWidth) painted = true
      },
      save: () => {},
      restore: () => {},
      clip: () => {},
      putImageData: () => {},
      getImageData: (_x: number, _y: number, width: number, height: number) => {
        const data = new Uint8ClampedArray(width * height * 4)

        if (!painted) return { data }

        for (let at = 0; at < data.length; at += 4) {
          data[at] = OPEN_WATER[0]
          data[at + 1] = OPEN_WATER[1]
          data[at + 2] = OPEN_WATER[2]
          data[at + 3] = OPEN_WATER[3]
        }

        return { data }
      },
    }),
  }
}

/** The art's own frame, decoded. */
const ART = { w: 1536, h: 1024 }
const IMAGE = {
  naturalWidth: ART.w,
  naturalHeight: ART.h,
} as HTMLImageElement

/** A wide viewport, where the art is contained and the frame fills the canvas. */
const WIDE = computeScene(
  { left: 184.328125, top: 0, width: 1351.671875, height: 1024 },
  ART,
  false,
  1,
)

/** A phone, where the art covers the wrap and hangs off its left edge. */
const NARROW = computeScene(
  { left: 0, top: 0, width: 390, height: 844 },
  ART,
  true,
  1,
)

/** A wall of a screen, where the art is contained in a much larger frame. */
const LARGE = computeScene(
  { left: 0, top: 0, width: 2253, height: 1440 },
  ART,
  false,
  1,
)

/** A point of open water, and two more measured from it. */
const STRUCK = { nx: 0.47, ny: 0.75 }
/** Under a step from the strike on the wide scene. */
const NEAR = 0.474
/** Over a step from it. */
const FAR = 0.49

/** The wide scene's normalized coordinate a distance across from the strike. */
const across = (pixels: number) => STRUCK.nx + pixels / WIDE.frame.width

/** The life every ring below is given, with the spread held at 0. */
const LIFE = 940

/*
 * The module's own sizes, which are fractions of the frame's shorter side
 * rather than canvas pixels: a ripple is as large as the pond it lies on. A
 * test that wants pixels multiplies them by the scene it is drawing in.
 */
const BIRTH = 0.006
const REACH = 0.052
const REACH_SPREAD = 0.022
const SPAWN_STEP = 0.014
const CREST = 0.0027
const GAIN = 2.3

/** The frame's shorter side, which every size above is measured against. */
const short = (scene: Scene) => Math.min(scene.frame.width, scene.frame.height)

/** How far a ring has opened at a point in its life. */
const opening = (progress: number) => 1 - (1 - progress) ** 1.9

/** The step throttle in canvas pixels, on the wide scene. */
const STEP = short(WIDE) * SPAWN_STEP

let clock = 0

beforeEach(() => {
  clock = 1000
  vi.stubGlobal(
    'Path2D',
    class {
      moveTo() {}
      bezierCurveTo() {}
      closePath() {}
    },
  )
  vi.stubGlobal('document', { createElement: () => fakeCanvas() })
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  vi.spyOn(Math, 'random').mockReturnValue(0)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** A started effect, on the scene given. */
function started(scene: Scene = WIDE) {
  const ripples = createRipples()

  ripples.init(IMAGE, scene)

  return ripples
}

/** One drawn crest: the ellipse asked for, and the ink it was drawn in. */
interface Mark {
  x: number
  y: number
  radiusX: number
  radiusY: number
  tilt: number
  ink: Gradient
  alpha: number
  width: number
}

/** Every crest drawn in these calls, in the order they were drawn. */
function marks(calls: readonly Call[]): Mark[] {
  const drawn: Mark[] = []
  let ellipse: Call | null = null

  for (const call of calls) {
    if (call.name === 'ellipse') {
      ellipse = call
      continue
    }

    if (call.name !== 'stroke' || !ellipse) continue

    const [x, y, radiusX, radiusY, tilt] = ellipse.args as number[]

    expect(
      typeof call.strokeStyle === 'object' && call.strokeStyle.kind === 'linear',
      `a crest is stroked with a gradient, not ${String(call.strokeStyle)}`,
    ).toBe(true)

    drawn.push({
      x,
      y,
      radiusX,
      radiusY,
      tilt,
      ink: call.strokeStyle as Gradient,
      alpha: call.alpha,
      width: call.lineWidth,
    })
    ellipse = null
  }

  return drawn
}

/** Where the rings drawn in these calls were struck, on the canvas. */
function centers(calls: readonly Call[]): number[] {
  const seen: number[] = []

  for (const call of calls) {
    if (call.name !== 'ellipse') continue

    const x = call.args[0] as number

    if (!seen.some((held) => Math.abs(held - x) < 1e-9)) seen.push(x)
  }

  return seen
}

describe('still water', () => {
  test('draws nothing and asks nothing of the canvas', () => {
    const ripples = started()
    const { calls, context } = recorder()

    expect(ripples.draw(context, WIDE, clock)).toBe(false)
    expect(calls).toEqual([])
  })

  test('is what a pointer off the water leaves', () => {
    const ripples = started()
    const { calls, context } = recorder()

    ripples.pointer(0.1, 0.1, 'move')

    expect(ripples.draw(context, WIDE, clock)).toBe(false)
    expect(calls).toEqual([])
  })

  test('is what a pointer off the art leaves', () => {
    const ripples = started()
    const { context } = recorder()

    ripples.pointer(1.4, 0.5, 'move')

    expect(ripples.draw(context, WIDE, clock)).toBe(false)
  })

  test('is not what an art that never decoded leaves', () => {
    const ripples = createRipples()
    const { calls, context } = recorder()

    ripples.init({ naturalWidth: 0, naturalHeight: 0 } as HTMLImageElement, WIDE)
    ripples.pointer(STRUCK.nx, STRUCK.ny, 'move')

    // Nothing was sampled, so the pond's shape is the whole answer and the
    // ring is still struck. What is missing is the mask, and the pass has to
    // end without one rather than end the effect.
    expect(ripples.draw(context, WIDE, clock)).toBe(true)
    expect(calls.some((call) => call.composite === 'destination-in')).toBe(false)
  })
})

describe('a ring struck on the water', () => {
  test('is drawn, and keeps the effect animating', () => {
    const ripples = started()
    const { calls, context } = recorder()

    ripples.pointer(STRUCK.nx, STRUCK.ny, 'move')

    expect(ripples.draw(context, WIDE, clock)).toBe(true)
    expect(centers(calls)).toHaveLength(1)
  })

  test('opens, flattens and fades to the numbers it is given', () => {
    const ripples = started()
    const { calls, context } = recorder()

    ripples.pointer(STRUCK.nx, STRUCK.ny, 'move')
    // Half of the ring's life, so every term below is off its own middle.
    ripples.draw(context, WIDE, clock + LIFE / 2)

    const side = short(WIDE)
    const birth = side * BIRTH
    const opened = opening(0.5)
    const radius = birth + opened * side * REACH
    // The clock's fall and the crest's own spreading, which are two different
    // things and both of them here.
    const fade = 0.5 * Math.sqrt(birth / radius) * 0.8 * GAIN
    const squash = 0.2 + STRUCK.ny * 0.11
    const thinning = 0.58 + 0.42 * (1 - opened)
    const drawn = marks(calls)

    // A strike raises a train of three, not one ring.
    expect(drawn).toHaveLength(3)

    const [front, second, third] = drawn

    expect(front.x).toBeCloseTo(STRUCK.nx * WIDE.frame.width, 9)
    expect(front.y).toBeCloseTo(STRUCK.ny * WIDE.frame.height, 9)
    expect(front.radiusX).toBeCloseTo(radius, 9)
    expect(front.radiusY).toBeCloseTo(radius * squash, 9)
    expect(front.tilt).toBe(-0.035)
    expect(front.alpha).toBeCloseTo(fade, 9)
    expect(front.width).toBeCloseTo(side * CREST * 1.6 * thinning, 9)

    // The two behind it stand at fractions of the leading crest's own radius,
    // so the train spreads as it travels rather than holding a fixed gap.
    expect(second.x).toBe(front.x)
    expect(second.y).toBe(front.y)
    expect(second.radiusX).toBeCloseTo(radius * 0.72, 9)
    expect(second.radiusY).toBeCloseTo(radius * 0.72 * squash, 9)
    expect(second.alpha).toBeCloseTo(fade * 0.6, 9)
    expect(second.width).toBeCloseTo(side * CREST * 1.15 * thinning, 9)

    expect(third.radiusX).toBeCloseTo(radius * 0.5, 9)
    expect(third.alpha).toBeCloseTo(fade * 0.3, 9)
    expect(third.width).toBeCloseTo(side * CREST * 0.9 * thinning, 9)
  })

  test('takes the lantern on the face turned towards it', () => {
    const ripples = started()
    const { calls, context } = recorder()

    ripples.pointer(STRUCK.nx, STRUCK.ny, 'move')
    ripples.draw(context, WIDE, clock + LIFE / 2)

    const side = short(WIDE)
    const radius = side * BIRTH + opening(0.5) * side * REACH
    const squash = 0.2 + STRUCK.ny * 0.11
    const x = STRUCK.nx * WIDE.frame.width
    const y = STRUCK.ny * WIDE.frame.height
    const drawn = marks(calls)

    // One gradient serves the whole train: the crests behind the leading one
    // stand inside it and take the middle of it.
    expect(new Set(drawn.map((mark) => mark.ink)).size).toBe(1)

    const { from, to, stops } = drawn[0].ink

    // It runs across the leading crest, from the lantern's side to the far
    // one. Up and to the right is where the lantern stands.
    expect(from[0]).toBeCloseTo(x + radius * 0.82, 9)
    expect(from[1]).toBeCloseTo(y + radius * squash * -0.57, 9)
    expect(to[0]).toBeCloseTo(x - radius * 0.82, 9)
    expect(to[1]).toBeCloseTo(y - radius * squash * -0.57, 9)
    expect(from[0]).toBeGreaterThan(to[0])
    expect(from[1]).toBeLessThan(to[1])

    // The lit end is whole and the far end keeps only the sky.
    expect(stops.map(([offset]) => offset)).toEqual([0, 0.42, 1])
    expect(stops[0][1]).toBe('rgba(246, 251, 228, 1)')
    expect(stops[2][1]).toBe('rgba(143, 201, 216, 0.3)')
  })

  test('opens from a mark rather than from nothing', () => {
    const ripples = started()
    const { calls, context } = recorder()

    ripples.pointer(STRUCK.nx, STRUCK.ny, 'move')
    ripples.draw(context, WIDE, clock)

    const drawn = marks(calls)

    // The whole train stands on the frame the strike lands: it is born at a
    // mark rather than at a point, so the crests are apart from the start.
    expect(drawn).toHaveLength(3)
    expect(drawn[0].radiusX).toBeCloseTo(short(WIDE) * BIRTH, 9)
  })

  test('is as large as the pond it lies on', () => {
    const ripples = started()
    const laptop = recorder()
    const wall = recorder()

    ripples.pointer(STRUCK.nx, STRUCK.ny, 'move')
    ripples.draw(laptop.context, WIDE, clock + LIFE / 2)

    const large = started(LARGE)

    large.pointer(STRUCK.nx, STRUCK.ny, 'move')
    large.draw(wall.context, LARGE, clock + LIFE / 2)

    const near = marks(laptop.calls)[0]
    const far = marks(wall.calls)[0]

    // The ring is the same fraction of either frame, which is the whole point
    // of measuring it in one: held in canvas pixels it would be the same coin
    // on a laptop and on a wall. The crest's own thickness goes with it.
    expect(near.radiusX / short(WIDE)).toBeCloseTo(far.radiusX / short(LARGE), 9)
    expect(near.width / short(WIDE)).toBeCloseTo(far.width / short(LARGE), 9)
    expect(far.radiusX).toBeGreaterThan(near.radiusX * 1.5)
  })

  test('sits where the art puts it, not where the canvas starts', () => {
    const ripples = started(NARROW)
    const { calls, context } = recorder()

    ripples.pointer(STRUCK.nx, STRUCK.ny, 'move')
    ripples.draw(context, NARROW, clock)

    const moved = calls.find((call) => call.name === 'translate')
    const ring = calls.find((call) => call.name === 'ellipse')

    expect(moved?.args).toEqual([NARROW.frame.left, NARROW.frame.top])
    expect(ring?.args[0]).toBeCloseTo(STRUCK.nx * NARROW.frame.width, 6)
    expect(ring?.args[1]).toBeCloseTo(STRUCK.ny * NARROW.frame.height, 6)
    expect(NARROW.frame.left).toBeLessThan(0)
  })

  test('is clipped to the pond, and the pass ends cut to the water', () => {
    const ripples = started()
    const { calls, context } = recorder()

    ripples.pointer(STRUCK.nx, STRUCK.ny, 'move')
    ripples.draw(context, WIDE, clock)

    const order = calls.map((call) => call.name)

    expect(order.slice(0, 3)).toEqual(['save', 'translate', 'clip'])
    expect(order.indexOf('clip')).toBeLessThan(order.indexOf('ellipse'))
    expect(order.indexOf('ellipse')).toBeLessThan(order.indexOf('restore'))

    // The mask closes the pass, over the frame and nothing else, and the
    // composite it needs is left behind it.
    const cut = calls.at(-2)

    expect(cut?.name).toBe('drawImage')
    expect(cut?.composite).toBe('destination-in')
    expect(cut?.args.slice(1)).toEqual([
      0,
      0,
      SAMPLE_WIDTH,
      SAMPLE_HEIGHT,
      WIDE.frame.left,
      WIDE.frame.top,
      WIDE.frame.width,
      WIDE.frame.height,
    ])
    expect(calls.at(-1)?.name).toBe('restore')
    expect(calls.filter((call) => call.name === 'save')).toHaveLength(2)
    expect(calls.filter((call) => call.name === 'restore')).toHaveLength(2)
  })

  test('never sets the transform the entry owns', () => {
    const ripples = started()
    const { calls, context } = recorder()

    ripples.pointer(STRUCK.nx, STRUCK.ny, 'move')
    ripples.draw(context, WIDE, clock)

    expect(calls.some((call) => call.name === 'setTransform')).toBe(false)
  })

  test('lives out its whole life and is then dropped', () => {
    const ripples = started()
    const { context } = recorder()

    ripples.pointer(STRUCK.nx, STRUCK.ny, 'move')

    expect(ripples.draw(context, WIDE, clock + LIFE - 1)).toBe(true)
    expect(ripples.draw(context, WIDE, clock + LIFE)).toBe(true)
    expect(ripples.draw(context, WIDE, clock + LIFE + 1)).toBe(false)
  })

  test('is given up to 190 milliseconds and a spread more reach than the least', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1)

    const ripples = started()
    const { calls, context } = recorder()

    ripples.pointer(STRUCK.nx, STRUCK.ny, 'move')

    expect(ripples.draw(context, WIDE, clock + LIFE + 190)).toBe(true)
    expect(ripples.draw(context, WIDE, clock + LIFE + 191)).toBe(false)

    const opened = marks(calls)[0]
    const side = short(WIDE)

    // The ring drawn at the end of its life has opened its whole reach.
    expect(opened.radiusX).toBeCloseTo(side * BIRTH + side * (REACH + REACH_SPREAD), 9)
  })

  test('goes with the effect when it is disposed', () => {
    const ripples = started()
    const { context } = recorder()

    ripples.pointer(STRUCK.nx, STRUCK.ny, 'move')
    ripples.dispose()

    expect(ripples.draw(context, WIDE, clock)).toBe(false)
  })
})

describe('a resize', () => {
  test('ends the rings it was holding', () => {
    const ripples = started()
    const { calls, context } = recorder()

    ripples.pointer(STRUCK.nx, STRUCK.ny, 'move')
    clock = 1200
    ripples.pointer(FAR, STRUCK.ny, 'move')
    ripples.resize(WIDE)

    // Nothing survives to be rasterized into the new backing store: no
    // stroke, no clip, and no closing composite.
    expect(ripples.draw(context, WIDE, clock)).toBe(false)
    expect(calls).toEqual([])
  })

  test('leaves the effect ready for the next strike', () => {
    const ripples = started()
    const { calls, context } = recorder()

    ripples.pointer(STRUCK.nx, STRUCK.ny, 'move')
    ripples.resize(NARROW)
    clock = 1200
    ripples.pointer(STRUCK.nx, STRUCK.ny, 'move')

    expect(ripples.draw(context, NARROW, clock)).toBe(true)
    expect(centers(calls)).toHaveLength(1)
  })

  test('measures the strikes after it in the new scene', () => {
    const ripples = started()
    const { calls, context } = recorder()
    // Far enough apart to clear 12 canvas pixels on the wide scene, and not
    // on the narrow one: only the scene the resize carried decides this.
    const apart = 0.00918

    expect(apart * WIDE.frame.width).toBeGreaterThan(12)
    expect(apart * NARROW.frame.width).toBeLessThan(12)

    ripples.resize(NARROW)
    clock = 1200
    ripples.pointer(STRUCK.nx, STRUCK.ny, 'move')
    clock = 1400
    ripples.pointer(STRUCK.nx + apart, STRUCK.ny, 'move')
    ripples.draw(context, NARROW, clock)

    expect(centers(calls)).toHaveLength(1)
  })

  test('breaks the chain across itself', () => {
    const ripples = started()
    const { calls, context } = recorder()

    ripples.pointer(STRUCK.nx, STRUCK.ny, 'move')
    ripples.resize(WIDE)
    clock = 1200
    // Under 12 canvas pixels from the strike before the resize. The chain
    // ended with that strike, so this one is measured from nothing and lands.
    ripples.pointer(NEAR, STRUCK.ny, 'move')
    ripples.draw(context, WIDE, clock)

    const drawn = centers(calls)

    expect(drawn).toHaveLength(1)
    expect(drawn[0]).toBeCloseTo(NEAR * WIDE.frame.width, 9)
  })
})

describe('the pool of rings', () => {
  test('holds 14, and drops the oldest to take a new one', () => {
    const ripples = started()
    const { calls, context } = recorder()
    // A press clears both throttles, so 15 of them all land on one clock.
    const struck = Array.from({ length: 15 }, (_, at) => 0.4 + at * 0.012)

    for (const nx of struck) ripples.pointer(nx, STRUCK.ny, 'down')

    ripples.draw(context, WIDE, clock)

    const drawn = centers(calls)
    const canvas = (nx: number) => nx * WIDE.frame.width
    const holds = (nx: number) =>
      drawn.some((x) => Math.abs(x - canvas(nx)) < 1e-9)

    expect(drawn).toHaveLength(14)
    expect(holds(struck[0])).toBe(false)
    expect(holds(struck[1])).toBe(true)
    expect(holds(struck[14])).toBe(true)
  })
})

describe('the strength of a strike', () => {
  test('a press marks the water harder than a pass', () => {
    const ripples = started()
    const { calls, context } = recorder()

    ripples.pointer(STRUCK.nx, STRUCK.ny, 'move')
    ripples.pointer(0.5, STRUCK.ny, 'down')
    ripples.draw(context, WIDE, clock + LIFE / 2)

    const drawn = marks(calls)
    const pass = drawn.filter(
      (mark) => Math.abs(mark.x - STRUCK.nx * WIDE.frame.width) < 1e-9,
    )
    const press = drawn.filter(
      (mark) => Math.abs(mark.x - 0.5 * WIDE.frame.width) < 1e-9,
    )

    expect(pass).toHaveLength(3)
    expect(press).toHaveLength(3)

    const side = short(WIDE)
    const birth = side * BIRTH
    const radius = birth + opening(0.5) * side * REACH
    const fade = 0.5 * Math.sqrt(birth / radius) * GAIN

    // Both trains are the same age and the same size, so all that is left
    // between them is the strength each was struck with: 1.25 against 0.8.
    for (let crest = 0; crest < 3; crest += 1) {
      expect(press[crest].alpha / pass[crest].alpha).toBeCloseTo(1.25 / 0.8, 9)
    }

    expect(pass[0].alpha).toBeCloseTo(fade * 0.8, 9)
    expect(press[0].alpha).toBeCloseTo(fade * 1.25, 9)
  })
})

describe('the throttles between a pointer and the pool', () => {
  const strike = (
    ripples: ReturnType<typeof started>,
    nx: number,
    at: number,
  ) => {
    clock = at
    ripples.pointer(nx, STRUCK.ny, 'move')
  }

  const struckTwice = (second: number, at: number) => {
    const ripples = started()
    const { calls, context } = recorder()

    strike(ripples, STRUCK.nx, 1000)
    strike(ripples, second, at)
    ripples.draw(context, WIDE, clock)

    return centers(calls).length
  }

  test('hold a second ring back until 95 milliseconds have passed', () => {
    expect(struckTwice(FAR, 1094)).toBe(1)
    expect(struckTwice(FAR, 1095)).toBe(2)
  })

  // The step is a fraction of the frame like every other size here, so a
  // pointer crossing a wall-sized pond is held to the same share of it that a
  // pointer crossing a phone is.
  test('hold a second ring back until it is a step away', () => {
    expect(struckTwice(across(STEP - 0.1), 1200)).toBe(1)
    expect(struckTwice(across(STEP + 0.1), 1200)).toBe(2)
  })

  test('let a ring through once both are clear', () => {
    expect(struckTwice(FAR, 1200)).toBe(2)
  })

  test('hold one back that is only clear of one of them', () => {
    expect(struckTwice(FAR, 1050)).toBe(1)
    expect(struckTwice(NEAR, 1200)).toBe(1)
  })

  test('are both cleared by a press', () => {
    const ripples = started()
    const { calls, context } = recorder()

    strike(ripples, STRUCK.nx, 1000)
    clock = 1010
    ripples.pointer(NEAR, STRUCK.ny, 'down')
    ripples.draw(context, WIDE, clock)

    expect(centers(calls)).toHaveLength(2)
  })
})

describe('the chain a pointer draws', () => {
  const strike = (
    ripples: ReturnType<typeof started>,
    nx: number,
    at: number,
  ) => {
    clock = at
    ripples.pointer(nx, STRUCK.ny, 'move')
  }

  test('holds while the pointer stays on the water', () => {
    const ripples = started()
    const { calls, context } = recorder()

    strike(ripples, STRUCK.nx, 1000)
    strike(ripples, NEAR, 1200)
    ripples.draw(context, WIDE, clock)

    expect(centers(calls)).toHaveLength(1)
  })

  test('breaks where the pointer crosses off the water', () => {
    const ripples = started()
    const { calls, context } = recorder()

    strike(ripples, STRUCK.nx, 1000)
    strike(ripples, 0.1, 1100)
    strike(ripples, NEAR, 1200)
    ripples.draw(context, WIDE, clock)

    expect(centers(calls)).toHaveLength(2)
  })

  test('breaks where the pointer leaves the art', () => {
    const ripples = started()
    const { calls, context } = recorder()

    strike(ripples, STRUCK.nx, 1000)
    strike(ripples, 1.4, 1100)
    strike(ripples, NEAR, 1200)
    ripples.draw(context, WIDE, clock)

    expect(centers(calls)).toHaveLength(2)
  })

  test('breaks when the pointer leaves the hero', () => {
    const ripples = started()
    const { calls, context } = recorder()

    strike(ripples, STRUCK.nx, 1000)
    clock = 1100
    ripples.pointer(STRUCK.nx, STRUCK.ny, 'leave')
    strike(ripples, NEAR, 1200)
    ripples.draw(context, WIDE, clock)

    expect(centers(calls)).toHaveLength(2)
  })
})

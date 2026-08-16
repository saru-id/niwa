import { describe, expect, test } from 'vitest'

import {
  BASIN_CENTER,
  BASIN_RADIUS,
  BASIN_ROTATION,
  BASIN_SOURCE,
  createBasin,
  createField,
  drive,
  glintAlpha,
  IMPACT,
  OVERLAY_OFFSET,
  paintBasin,
  refract,
  stepField,
  type WaveField,
} from './basin'
import { computeScene, type Rect } from './geometry'

/** One call the paint made, and what it passed. */
interface Call {
  readonly name: string
  readonly args: readonly unknown[]
}

/** A context that records instead of painting. */
interface Recorder {
  save: () => void
  restore: () => void
  beginPath: (...args: unknown[]) => void
  clip: (...args: unknown[]) => void
  fill: (...args: unknown[]) => void
  ellipse: (...args: unknown[]) => void
  drawImage: (...args: unknown[]) => void
  globalCompositeOperation: string
  fillStyle: string
  imageSmoothingEnabled: boolean
}

/** The state a paint may change, which save holds and restore hands back. */
type State = Pick<
  Recorder,
  'globalCompositeOperation' | 'fillStyle' | 'imageSmoothingEnabled'
>

const stateOf = (context: Recorder): State => ({
  globalCompositeOperation: context.globalCompositeOperation,
  fillStyle: context.fillStyle,
  imageSmoothingEnabled: context.imageSmoothingEnabled,
})

/**
 * A recording context, with a real save and restore.
 *
 * It carries the calls the paint is allowed to make and nothing else, so a
 * paint that reached for anything more — `setTransform` above all — fails
 * here rather than on a page. Save and restore keep a stack of the state a
 * paint may change, so a write that lands outside a pair survives the paint
 * and the test can see it. Every write goes through an accessor, so the test
 * can also see that the paint writes at all.
 */
const recorder = () => {
  const calls: Call[] = []
  const writes: Call[] = []
  const held: State[] = []
  const live: State = {
    globalCompositeOperation: 'source-over',
    fillStyle: '#000000',
    imageSmoothingEnabled: false,
  }
  const note =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push({ name, args })
    }
  const write = (name: string, value: unknown) => {
    writes.push({ name, args: [value] })
  }

  const context: Recorder = {
    save: () => {
      note('save')()
      held.push({ ...live })
    },
    restore: () => {
      note('restore')()
      const previous = held.pop()
      if (previous === undefined) throw new Error('restore without a save')
      // A restore hands state back rather than writing it, so it goes around
      // the accessors and never counts as a write.
      Object.assign(live, previous)
    },
    beginPath: note('beginPath'),
    clip: note('clip'),
    fill: note('fill'),
    ellipse: note('ellipse'),
    drawImage: note('drawImage'),
    get globalCompositeOperation() {
      return live.globalCompositeOperation
    },
    set globalCompositeOperation(value: string) {
      write('globalCompositeOperation', value)
      live.globalCompositeOperation = value
    },
    get fillStyle() {
      return live.fillStyle
    },
    set fillStyle(value: string) {
      write('fillStyle', value)
      live.fillStyle = value
    },
    get imageSmoothingEnabled() {
      return live.imageSmoothingEnabled
    },
    set imageSmoothingEnabled(value: boolean) {
      write('imageSmoothingEnabled', value)
      live.imageSmoothingEnabled = value
    },
  }

  return { calls, writes, context }
}

/** The recorder where a signature asks for the real thing. */
const asContext = (context: Recorder) => context as unknown as CanvasRenderingContext2D

/** An ellipse as the context receives it. */
const ellipseOf = (call: Call) => ({
  x: call.args[0] as number,
  y: call.args[1] as number,
  radiusX: call.args[2] as number,
  radiusY: call.args[3] as number,
  rotation: call.args[4] as number,
})

/** What one paint over one frame put on the context. */
const paint = (frame: Rect, now = 0) => {
  const { calls, writes, context } = recorder()
  const entry = stateOf(context)
  paintBasin(asContext(context), frame, {} as unknown as CanvasImageSource, now)

  const ellipses = calls.filter((call) => call.name === 'ellipse')
  const images = calls.filter((call) => call.name === 'drawImage')
  expect(ellipses).toHaveLength(2)
  expect(images).toHaveLength(1)

  // The clip goes down first and the glint last: that is the draw order.
  const [clip, glint] = ellipses
  const box = images[0].args

  return {
    calls,
    writes,
    context,
    entry,
    clip: ellipseOf(clip),
    glint: ellipseOf(glint),
    box: {
      left: box[1] as number,
      top: box[2] as number,
      width: box[3] as number,
      height: box[4] as number,
    },
  }
}

/** The basin's place on a frame, before the overlay's shift. */
const basinCenter = (frame: Rect) => ({
  x: frame.left + frame.width * BASIN_CENTER.x,
  y: frame.top + frame.height * BASIN_CENTER.y,
})

/** Where the paint put the wave image, measured from that place. */
const shift = (frame: Rect) => {
  const { box } = paint(frame)
  const center = basinCenter(frame)
  return {
    x: box.left + box.width / 2 - center.x,
    y: box.top + box.height / 2 - center.y,
  }
}

/** Where the glint sits inside the water, from 0 to 1 on each axis. */
const glintPlace = (frame: Rect) => {
  const { clip, glint } = paint(frame)
  return {
    x: (glint.x - clip.x) / (clip.radiusX * 2) + 0.5,
    y: (glint.y - clip.y) / (clip.radiusY * 2) + 0.5,
  }
}

/** The field's deepest cell, from 0 to 1 on each axis. */
const deepest = (field: WaveField) => {
  let found = 0
  for (let index = 1; index < field.current.length; index += 1) {
    if (field.current[index] < field.current[found]) found = index
  }
  return {
    x: (found % field.width) / (field.width - 1),
    y: Math.floor(found / field.width) / (field.height - 1),
  }
}

/** A source where no two neighbours agree, so any shift in the sampling shows. */
const speckle = (field: WaveField) => {
  const pixels = new Uint8ClampedArray(field.width * field.height * 4)
  for (let index = 0; index < field.width * field.height; index += 1) {
    pixels[index * 4] = (index * 7) % 256
    pixels[index * 4 + 1] = (index * 13 + 40) % 256
    pixels[index * 4 + 2] = (index * 29 + 90) % 256
    pixels[index * 4 + 3] = 255
  }
  return pixels
}

/** The desktop frame: the art contained in the wrap, filling the canvas. */
const CONTAINED: Rect = { left: 0, top: 0, width: 1351.671875, height: 901.1146 }
/** The phone frame: the art covers the wrap and hangs off to the left. */
const COVERING: Rect = { left: -569.4, top: 0, width: 1266, height: 844 }
/** Probes: a square frame, one stretched on each axis alone, one moved. */
const SQUARE: Rect = { left: 0, top: 0, width: 1000, height: 1000 }
const WIDER: Rect = { left: 0, top: 0, width: 2000, height: 1000 }
const TALLER: Rect = { left: 0, top: 0, width: 1000, height: 2000 }
const MOVED: Rect = { left: 37.5, top: -19.25, width: 1000, height: 1000 }
const FRAMES = [CONTAINED, COVERING, SQUARE, WIDER, TALLER, MOVED]

describe('the overlay draw', () => {
  test('sits off the basin center by the overlay offset, in both axes', () => {
    for (const frame of FRAMES) {
      expect(shift(frame).x).toBeCloseTo(frame.width * OVERLAY_OFFSET.x, 9)
      expect(shift(frame).y).toBeCloseTo(frame.height * OVERLAY_OFFSET.y, 9)
    }
  })

  test('reads each axis of the frame for its own axis of the offset', () => {
    // Stretching one side of the frame moves that shift and leaves the other
    // alone. An offset that read the wrong side would fail here.
    const square = shift(SQUARE)
    const wider = shift(WIDER)
    const taller = shift(TALLER)

    expect(wider.x).toBeCloseTo(square.x * 2, 9)
    expect(wider.y).toBeCloseTo(square.y, 9)
    expect(taller.x).toBeCloseTo(square.x, 9)
    expect(taller.y).toBeCloseTo(square.y * 2, 9)
  })

  test('moves the two axes opposite ways', () => {
    // One offset used for both axes would move them the same way. These do
    // not, so neither axis can be standing in for the other.
    expect(shift(SQUARE).x).toBeLessThan(0)
    expect(shift(SQUARE).y).toBeGreaterThan(0)
  })

  test('fills exactly the box the water bounds', () => {
    for (const frame of FRAMES) {
      const { box, clip } = paint(frame)
      expect(clip.radiusX).toBeCloseTo(frame.width * BASIN_RADIUS.x, 9)
      expect(clip.radiusY).toBeCloseTo(frame.height * BASIN_RADIUS.y, 9)
      expect(box.width).toBeCloseTo(clip.radiusX * 2, 9)
      expect(box.height).toBeCloseTo(clip.radiusY * 2, 9)
    }
  })
})

describe('the clip', () => {
  test('centers where the overlay draws', () => {
    for (const frame of FRAMES) {
      const { box, clip } = paint(frame)
      expect(clip.x).toBeCloseTo(box.left + box.width / 2, 9)
      expect(clip.y).toBeCloseTo(box.top + box.height / 2, 9)
    }
  })
})

describe('the refraction', () => {
  const still = createField(80, 80)
  const source = speckle(still)

  test('samples the source unshifted while the water is still', () => {
    const target = new Uint8ClampedArray(source.length)
    refract(still, source, target)

    for (let index = 0; index < still.mask.length; index += 1) {
      const pixel = index * 4
      if (still.mask[index] === 0) {
        expect(target[pixel + 3]).toBe(0)
        continue
      }
      expect(target[pixel]).toBe(source[pixel])
      expect(target[pixel + 1]).toBe(source[pixel + 1])
      expect(target[pixel + 2]).toBe(source[pixel + 2])
      expect(target[pixel + 3]).toBeGreaterThan(0)
    }
  })

  test('bends the source once the water moves', () => {
    // The still reading above only means something if a moving surface reads
    // differently.
    const moving = createField(80, 80)
    for (let step = 0; step < 40; step += 1) stepField(moving, (step * 1000) / 60)

    const target = new Uint8ClampedArray(source.length)
    refract(moving, source, target)

    let bent = 0
    for (let index = 0; index < moving.mask.length; index += 1) {
      if (moving.mask[index] === 0) continue
      if (target[index * 4] !== source[index * 4]) bent += 1
    }
    expect(bent).toBeGreaterThan(0)
  })
})

describe('the drip', () => {
  test('lands on the normalized impact, in both axes', () => {
    // A grid can only land on a cell, so the answer is right when it falls
    // within half a cell of the fraction. The grids differ on each axis, so
    // an impact read on the wrong one misses.
    for (const [width, height] of [
      [80, 80],
      [61, 41],
      [40, 96],
    ] as const) {
      const field = createField(width, height)
      stepField(field, 1234)
      const found = deepest(field)

      expect(Math.abs(found.x - IMPACT.x)).toBeLessThanOrEqual(0.5 / (width - 1))
      expect(Math.abs(found.y - IMPACT.y)).toBeLessThanOrEqual(0.5 / (height - 1))
    }
  })

  test('always presses down, and never stops', () => {
    let lightest = Infinity
    let heaviest = 0
    for (let time = 0; time < 60000; time += 37) {
      const press = drive(time)
      expect(press).toBeLessThan(0)
      lightest = Math.min(lightest, -press)
      heaviest = Math.max(heaviest, -press)
    }
    // The drips are the point: the press spikes far past its floor, and the
    // floor is never nothing, which is why the water is never done.
    expect(lightest).toBeGreaterThan(0)
    expect(heaviest).toBeGreaterThan(lightest * 4)
  })
})

describe('the glint', () => {
  test('sits on the impact inside the water, in both axes', () => {
    for (const frame of FRAMES) {
      expect(glintPlace(frame).x).toBeCloseTo(IMPACT.x, 9)
      expect(glintPlace(frame).y).toBeCloseTo(IMPACT.y, 9)
    }
  })

  test('lands where the drip lands', () => {
    // One place, two readers. The field's deepest cell and the glint's place
    // inside the water are the same fraction of the same water.
    const field = createField(80, 80)
    stepField(field, 1234)
    const found = deepest(field)
    const place = glintPlace(CONTAINED)

    expect(Math.abs(place.x - found.x)).toBeLessThanOrEqual(0.5 / 79)
    expect(Math.abs(place.y - found.y)).toBeLessThanOrEqual(0.5 / 79)
  })

  test('never goes out, and never floods the water', () => {
    let lowest = Infinity
    let highest = 0
    for (let time = 0; time < 20000; time += 13) {
      const alpha = glintAlpha(time)
      lowest = Math.min(lowest, alpha)
      highest = Math.max(highest, alpha)
    }

    // The floor is what keeps the point lit between the flickers, and the
    // range above it is what makes them read as flickers. Both bounds are
    // reached, so neither assertion passes on a glint that never moves.
    expect(lowest).toBeGreaterThanOrEqual(0.2)
    expect(lowest).toBeLessThan(0.21)
    expect(highest).toBeLessThanOrEqual(0.38)
    expect(highest).toBeGreaterThan(0.37)
  })
})

describe('the calibration', () => {
  test('pins every calibrated fraction exactly', () => {
    expect(OVERLAY_OFFSET.x).toBe(-0.0079)
    expect(OVERLAY_OFFSET.y).toBe(0.0049)
    expect(IMPACT.x).toBe(0.635)
    expect(IMPACT.y).toBe(0.58)
    expect(BASIN_RADIUS.x).toBe(0.0463)
    expect(BASIN_RADIUS.y).toBe(0.0145)
    expect(BASIN_CENTER.x).toBe(0.7129)
    expect(BASIN_CENTER.y).toBe(0.462)
    expect(BASIN_ROTATION).toBe(-0.018)
  })

  test('pins the patch of art the water samples', () => {
    // These place the water on the art's own pixels rather than on the frame,
    // and `init` is the only place that reads them. Nothing else in the suite
    // touches the raster, so drifting one would otherwise go unseen.
    expect(BASIN_SOURCE.left).toBe(0.6609)
    expect(BASIN_SOURCE.top).toBe(0.4445)
    expect(BASIN_SOURCE.width).toBe(0.104)
    expect(BASIN_SOURCE.height).toBe(0.035)
  })
})

describe('the rim', () => {
  test('turns the clip and the glint by the one rotation', () => {
    // The assertion is identity with the module's own export, not a literal
    // repeated here: one rim angle, and two ellipses that both carry it.
    for (const frame of FRAMES) {
      const { clip, glint } = paint(frame)
      expect(clip.rotation).toBe(BASIN_ROTATION)
      expect(glint.rotation).toBe(BASIN_ROTATION)
      expect(Object.is(clip.rotation, glint.rotation)).toBe(true)
    }
  })
})

describe('the effect', () => {
  test('leaves the context as it found it', () => {
    const { calls, context, entry } = paint(CONTAINED)
    const saves = calls.filter((call) => call.name === 'save')
    const restores = calls.filter((call) => call.name === 'restore')

    expect(saves).toHaveLength(restores.length)
    expect(calls[0].name).toBe('save')
    expect(calls[calls.length - 1].name).toBe('restore')
    // Balanced pairs alone would pass a write that sits outside one. Three
    // effects draw after the basin on the same context, and every one of them
    // inherits whatever it leaves, so the state itself is the assertion.
    expect(stateOf(context)).toEqual(entry)
  })

  test('changes the state it needs, inside the pair that hands it back', () => {
    // The check above is only worth something if the paint writes state at
    // all: the glint composites with screen, and the wave image is scaled up
    // far enough that it has to interpolate.
    const { writes } = paint(CONTAINED)
    const written = new Map(writes.map((write) => [write.name, write.args[0]]))

    expect(written.get('globalCompositeOperation')).toBe('screen')
    expect(written.get('imageSmoothingEnabled')).toBe(true)
  })

  test('builds nothing before init', () => {
    // Module scope and the factory touch no document: this file has none.
    expect(typeof document).toBe('undefined')

    const basin = createBasin()
    const scene = computeScene(
      { left: 0, top: 0, width: 1000, height: 800 },
      { w: 1536, h: 1024 },
      false,
      1,
    )

    // An effect with no buffers has nothing to animate.
    expect(basin.draw(asContext(recorder().context), scene, 0)).toBe(false)
    basin.resize(scene)
    basin.pointer(0.5, 0.5, 'move')
    basin.dispose()
    expect(basin.draw(asContext(recorder().context), scene, 16)).toBe(false)
  })
})

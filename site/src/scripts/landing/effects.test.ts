import { afterEach, describe, expect, test, vi } from 'vitest'

import { createFireflies } from './fireflies'
import { createFlowers } from './flowers'
import { computeScene } from './geometry'
import { createLantern } from './lantern'

/** The hero art's own pixel size. */
const ART = { w: 1536, h: 1024 }

/** The scene these three draw in: the art contained in the wrap, where the
 *  frame carries the canvas's size at the origin. */
const contained = computeScene(
  { left: 184.328125, top: 0, width: 1351.671875, height: 1024 },
  ART,
  false,
  1,
)

/** A scene where the frame is not the canvas. The entry never calls these
 *  three on a phone, but the conversion they place everything through has to
 *  answer to the frame wherever the frame sits. */
const covering = computeScene({ left: 0, top: 0, width: 390, height: 844 }, ART, true, 1)

/** The frame's shorter side, which every radius on the lantern is measured
 *  against. */
const SHORT = Math.min(contained.frame.width, contained.frame.height)

/** None of the three reads the art's pixels, so `init` has nothing to take. */
const noImage = null as unknown as HTMLImageElement

/** The fill the recorder starts with, which every draw has to give back. */
const BLANK = 'rgba(0, 0, 0, 0)'

/** The three beds, as flowers.ts holds them. */
const BEDS = [
  { x: 0.588, y: 0.433, radiusX: 0.072, radiusY: 0.075 },
  { x: 0.846, y: 0.548, radiusX: 0.09, radiusY: 0.1 },
  { x: 0.884, y: 0.815, radiusX: 0.072, radiusY: 0.07 },
]

/** The bed most of these probes use. */
const BED = BEDS[0]

/** The lantern's flame, and how far its answer reaches. */
const FLAME = { x: 0.625, y: 0.354 }
const REACH = 0.17

/** The share of its light the lantern burns at with no reader near it. The
 *  pointer's own share is the rest. */
const REST = 0.63

interface Light {
  x: number
  y: number
  phase: number
  drift: number
  glow: number
}

/** The field, as fireflies.ts holds it. */
const FIELD: Light[] = [
  { x: 0.555, y: 0.365, phase: 0.3, drift: 0.9, glow: 0.92 },
  { x: 0.625, y: 0.415, phase: 1.7, drift: 1.2, glow: 0.82 },
  { x: 0.684, y: 0.337, phase: 3.2, drift: 0.8, glow: 0.9 },
  { x: 0.735, y: 0.382, phase: 4.4, drift: 1.1, glow: 1 },
  { x: 0.792, y: 0.405, phase: 5.7, drift: 0.95, glow: 0.86 },
  { x: 0.842, y: 0.452, phase: 2.5, drift: 0.75, glow: 0.96 },
  { x: 0.891, y: 0.405, phase: 6.4, drift: 1.25, glow: 0.84 },
  { x: 0.918, y: 0.492, phase: 7.8, drift: 0.88, glow: 0.92 },
  { x: 0.864, y: 0.557, phase: 8.9, drift: 1.05, glow: 0.88 },
  { x: 0.775, y: 0.523, phase: 10.1, drift: 0.82, glow: 0.9 },
]

/** The colors one light is painted with, in the order they are laid down. */
const LIGHT_COLORS = ['255, 248, 195', '248, 191, 99', '245, 154, 93', '255, 252, 224']

/** Three frames a hundred milliseconds apart. The level closes nine
 *  hundredths of its gap on each of them, and the bed opens at a fifth, which
 *  the third frame reaches. The timestamps are given rather than read, so the
 *  window falls in the same place on every run. */
const OPENING = [1000, 1100, 1200]

/**
 * What a petal draws from, in the order the spawn takes them.
 *
 * The order is part of the shape: each value lands on one property, so a
 * petal built from this list is the same petal on every run and its place,
 * speed, size, turn and life can all be stated exactly.
 */
const PETAL_RANDOM = [
  0.5, // the angle around the bed: half a turn, so the start sits to its left
  0.25, // the spread: its square root is half way out
  0.75, // the sideways drift: a quarter of the range above the middle
  0.5, // the climb: the middle of its range
  0.4, // the size
  0.75, // the turn
  0.5, // the phase: half a turn, where the sway starts and the turn sets off
  0.4, // coral rather than cream, and close enough to the line to hold it
  0.5, // the life: the middle of its range
]

/** The same petal, cream instead of coral, and as close to the line on the
 *  other side of it. */
const CREAM_RANDOM = PETAL_RANDOM.map((value, index) => (index === 7 ? 0.3 : value))

/** The petal these values build, on the bed a probe opens. */
const PETAL = {
  angle: 0.5 * Math.PI * 2,
  spread: 0.5,
  size: 2.7 + 0.4 * 1.9,
  spin: (0.75 - 0.5) * 4,
  phase: 0.5 * Math.PI * 2,
  duration: 1250 + 0.5 * 700,
}

/** Where the petal leaves the bed, as a fraction of the art. */
const petalOrigin = (bed: (typeof BEDS)[number]) => ({
  nx: bed.x + Math.cos(PETAL.angle) * bed.radiusX * PETAL.spread,
  ny:
    bed.y + Math.sin(PETAL.angle) * bed.radiusY * PETAL.spread - bed.radiusY * 0.18,
})

const fixedRandom = (values = PETAL_RANDOM) => {
  let index = 0
  vi.spyOn(Math, 'random').mockImplementation(() => {
    const value = values[index % values.length]
    index += 1
    return value
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

interface Mark {
  call: string
  x: number
  y: number
  /** An arc's radius, an ellipse's first radius, a gradient's outer radius,
   *  or half the width of a filled box. */
  radius: number
  /** An ellipse's second radius, a gradient's inner radius, or half the
   *  height of a filled box. */
  second: number
  /** The angle an ellipse is turned by, or the angle a rotate asks for. */
  rotation: number
  /** The angles an arc or an ellipse is drawn from and to. */
  from: number
  to: number
}

/** An `rgba` color split into the channels it paints in and the opacity it
 *  paints at, which is the only form these effects write. */
const colorOf = (color: string) => {
  const found = /^rgba\(([^)]*),\s*([0-9.e+-]+)\)$/.exec(color)
  return found === null
    ? { channels: color, alpha: 0 }
    : { channels: found[1], alpha: Number(found[2]) }
}

const count = (calls: string[], name: string) =>
  calls.filter((call) => call === name).length

const marksOf = (marks: Mark[], name: string) =>
  marks.filter((mark) => mark.call === name)

/** All the opacity one draw laid down, which is how much light it added. */
const brightness = (alphas: number[]) =>
  alphas.reduce((total, alpha) => total + alpha, 0)

/** The lantern's flame at a moment: two waves over a steady burn. */
const flickerAt = (now: number) =>
  0.95 + Math.sin(now * 0.0037) * 0.025 + Math.sin(now * 0.0091) * 0.015

/** A light's clock, which runs at its own speed from its own phase. */
const lightTime = (light: Light, now: number) => now * 0.0008 * light.drift + light.phase

/** How bright a light burns at a moment. */
const lightStrength = (light: Light, now: number) =>
  (0.68 + Math.pow((Math.sin(lightTime(light, now) * 4.2) + 1) / 2, 2) * 0.32) * light.glow

/** Where a light has wandered to: a wide circle around its own place. */
const lightPlace = (light: Light, now: number) => ({
  x:
    contained.frame.left +
    contained.frame.width * (light.x + Math.sin(lightTime(light, now) * 1.7) * 0.008),
  y:
    contained.frame.top +
    contained.frame.height * (light.y + Math.cos(lightTime(light, now) * 1.15) * 0.012),
})

/**
 * A canvas that records instead of painting.
 *
 * These effects are drawing and nothing else, so what they did is the calls
 * they made. The recorder keeps the calls, the points and sizes they paint at,
 * and every color they hand over, split into the channels and the opacity. It
 * saves and restores the state they set, which is what makes a leak visible:
 * anything left behind is still there after the draw.
 */
function recorder() {
  const calls: string[] = []
  const marks: Mark[] = []
  const alphas: number[] = []
  const colors: string[] = []
  const offsets: number[] = []
  const stack: Array<{ fill: unknown; composite: string }> = []

  let fill: unknown = BLANK
  let composite = 'source-over'

  const mark = (
    call: string,
    x: number,
    y: number,
    radius = 0,
    second = 0,
    rotation = 0,
    from = 0,
    to = 0,
  ) => {
    calls.push(call)
    marks.push({ call, x, y, radius, second, rotation, from, to })
  }

  const paint = (color: string) => {
    const read = colorOf(color)
    colors.push(read.channels)
    alphas.push(read.alpha)
  }

  const gradient = {
    addColorStop(offset: number, color: string) {
      offsets.push(offset)
      paint(color)
    },
  }

  const context = {
    get fillStyle(): unknown {
      return fill
    },
    set fillStyle(value: unknown) {
      fill = value
    },
    get globalCompositeOperation(): string {
      return composite
    },
    set globalCompositeOperation(value: string) {
      composite = value
    },
    save() {
      calls.push('save')
      stack.push({ fill, composite })
    },
    restore() {
      calls.push('restore')
      const held = stack.pop()
      if (held === undefined) throw new Error('a restore with no save before it')
      fill = held.fill
      composite = held.composite
    },
    createRadialGradient(
      _fromX: number,
      _fromY: number,
      inner: number,
      x: number,
      y: number,
      radius: number,
    ) {
      mark('createRadialGradient', x, y, radius, inner)
      return gradient
    },
    fillRect(x: number, y: number, width: number, height: number) {
      mark('fillRect', x + width / 2, y + height / 2, width / 2, height / 2)
    },
    beginPath() {
      calls.push('beginPath')
    },
    arc(x: number, y: number, radius: number, from: number, to: number) {
      mark('arc', x, y, radius, 0, 0, from, to)
    },
    ellipse(
      x: number,
      y: number,
      radius: number,
      second: number,
      rotation: number,
      from: number,
      to: number,
    ) {
      mark('ellipse', x, y, radius, second, rotation, from, to)
    },
    translate(x: number, y: number) {
      mark('translate', x, y)
    },
    rotate(angle: number) {
      mark('rotate', 0, 0, 0, 0, angle, 0, 0)
    },
    fill() {
      calls.push('fill')
      if (typeof fill === 'string') paint(fill)
    },
    setTransform() {
      calls.push('setTransform')
    },
  }

  return {
    calls,
    marks,
    alphas,
    colors,
    offsets,
    /** How many saves are still open when the draw returns. */
    open: () => stack.length,
    fillStyle: () => fill,
    composite: () => composite,
    context: context as unknown as CanvasRenderingContext2D,
  }
}

describe('the ambient effects', () => {
  test('load where there is no page, and keep their state to themselves', () => {
    // The import at the top of this file is the check: a module that built a
    // canvas, read an image or bound a listener as it loaded would fail here,
    // where there is no document at all.
    expect(typeof globalThis.document).toBe('undefined')

    const one = createFlowers()
    const other = createFlowers()
    one.init(noImage, contained)
    other.init(noImage, contained)
    one.pointer(BED.x, BED.y, 'move')

    const first = recorder()
    const second = recorder()
    for (const now of OPENING) {
      one.draw(first.context, contained, now)
      other.draw(second.context, contained, now)
    }

    expect(count(first.calls, 'ellipse')).toBe(1)
    expect(second.calls).toEqual([])
  })

  test('leave the context as they found it', () => {
    const lantern = createLantern()
    const fireflies = createFireflies()
    const flowers = createFlowers()
    const effects = [lantern, fireflies, flowers]
    const paint = recorder()

    for (const effect of effects) effect.init(noImage, contained)
    lantern.pointer(FLAME.x, FLAME.y, 'move')
    flowers.pointer(BED.x, BED.y, 'move')

    for (const now of [...OPENING, 1300]) {
      for (const effect of effects) effect.draw(paint.context, contained, now)
    }

    expect(paint.calls).toContain('ellipse')
    // Ripples masks the canvas before these three draw and the entry owns the
    // density transform. An effect that left its own state behind would take
    // both with it.
    expect(paint.open()).toBe(0)
    expect(paint.fillStyle()).toBe(BLANK)
    expect(paint.composite()).toBe('source-over')
    expect(paint.calls).not.toContain('setTransform')
  })
})

describe('the lantern', () => {
  test('paints its halo and its panes at the sizes the art was measured for', () => {
    const lantern = createLantern()
    lantern.init(noImage, contained)
    const paint = recorder()

    expect(lantern.draw(paint.context, contained, 0)).toBe(false)

    const halos = marksOf(paint.marks, 'createRadialGradient')
    const boxes = marksOf(paint.marks, 'fillRect')
    // Four lights, widest and dimmest first: the bloom, the halo, two panes.
    expect(halos).toHaveLength(4)
    expect(boxes).toHaveLength(4)

    const flameX = contained.frame.left + contained.frame.width * FLAME.x
    const flameY = contained.frame.top + contained.frame.height * FLAME.y

    // The bloom is the air around the lantern, not the lantern: it stands on
    // the flame like the halo and reaches well over twice as far.
    expect(halos[0].x).toBeCloseTo(flameX, 9)
    expect(halos[0].y).toBeCloseTo(flameY, 9)
    expect(halos[0].radius).toBeCloseTo(SHORT * 0.138, 9)
    expect(halos[0].second).toBeCloseTo(SHORT * 0.02, 9)
    expect(halos[0].radius).toBeGreaterThan(halos[1].radius * 2)

    // The broad halo sits on the flame and opens from a two pixel core.
    expect(halos[1].x).toBeCloseTo(flameX, 9)
    expect(halos[1].y).toBeCloseTo(flameY, 9)
    expect(halos[1].radius).toBeCloseTo(SHORT * 0.058, 9)
    expect(halos[1].second).toBe(2)

    // The two panes, the wider one first.
    expect(halos[2].x).toBeCloseTo(contained.frame.left + contained.frame.width * 0.618, 9)
    expect(halos[2].y).toBeCloseTo(contained.frame.top + contained.frame.height * 0.355, 9)
    expect(halos[2].radius).toBeCloseTo(SHORT * 0.018, 9)
    expect(halos[3].x).toBeCloseTo(contained.frame.left + contained.frame.width * 0.641, 9)
    expect(halos[3].y).toBeCloseTo(contained.frame.top + contained.frame.height * 0.356, 9)
    expect(halos[3].radius).toBeCloseTo(SHORT * 0.012, 9)
    // A pane is lit through, so its own light opens from a point.
    expect(halos[2].second).toBe(0)
    expect(halos[3].second).toBe(0)

    // Every box covers its whole gradient and nothing more.
    for (let index = 0; index < boxes.length; index += 1) {
      expect(boxes[index].x).toBeCloseTo(halos[index].x, 9)
      expect(boxes[index].y).toBeCloseTo(halos[index].y, 9)
      expect(boxes[index].radius).toBeCloseTo(halos[index].radius, 9)
      expect(boxes[index].second).toBeCloseTo(halos[index].radius, 9)
    }

    // At rest the response is its floor, and every stop reads off it.
    expect(paint.alphas).toHaveLength(14)
    expect(paint.alphas[0]).toBeCloseTo(0.088 * REST * flickerAt(0), 9)
    expect(paint.alphas[1]).toBeCloseTo(0.04 * REST, 9)
    expect(paint.alphas[2]).toBe(0)
    expect(paint.alphas[3]).toBeCloseTo(0.31 * REST * flickerAt(0), 9)
    expect(paint.alphas[4]).toBeCloseTo(0.12 * REST, 9)
    expect(paint.alphas[5]).toBe(0)
    expect(paint.alphas[6]).toBeCloseTo(0.99 * REST * flickerAt(0), 9)
    expect(paint.alphas[7]).toBeCloseTo(0.85 * REST, 9)
    expect(paint.alphas[8]).toBeCloseTo(0.3 * REST, 9)
    expect(paint.alphas[9]).toBe(0)
    // The second pane burns at rather more than three quarters of the first.
    expect(paint.alphas[10]).toBeCloseTo(0.99 * REST * 0.78 * flickerAt(0), 9)
    expect(paint.alphas[11]).toBeCloseTo(0.85 * REST * 0.78, 9)
    expect(paint.alphas[12]).toBeCloseTo(0.3 * REST * 0.78, 9)
    expect(paint.alphas[13]).toBe(0)

    // The bloom is the faintest thing the lantern lays down, by a wide
    // margin: it is the air, and air that reads as a lamp is a second lamp.
    expect(paint.alphas[0]).toBeLessThan(paint.alphas[3] / 3)

    // The colors themselves: a warm core falling to a red that carries no
    // opacity, laid down at the same stops on both panes.
    expect(paint.colors).toEqual([
      '255, 178, 96',
      '243, 137, 72',
      '226, 108, 52',
      '255, 187, 96',
      '244, 143, 68',
      '231, 113, 52',
      '255, 249, 214',
      '255, 198, 104',
      '242, 130, 56',
      '232, 104, 43',
      '255, 249, 214',
      '255, 198, 104',
      '242, 130, 56',
      '232, 104, 43',
    ])
    expect(paint.offsets).toEqual([
      0, 0.42, 1, 0, 0.32, 1, 0, 0.18, 0.58, 1, 0, 0.18, 0.58, 1,
    ])
  })

  test('flickers on a clock of its own', () => {
    const lantern = createLantern()
    lantern.init(noImage, contained)
    const early = recorder()
    const later = recorder()

    // The level is at rest on both frames, so the whole difference is the
    // flicker: two waves at speeds that do not divide into each other.
    lantern.draw(early.context, contained, 0)
    lantern.draw(later.context, contained, 1000)

    expect(early.alphas[0]).toBeCloseTo(0.088 * REST * flickerAt(0), 9)
    expect(later.alphas[0]).toBeCloseTo(0.088 * REST * flickerAt(1000), 9)
    expect(later.alphas[0]).not.toBeCloseTo(early.alphas[0], 5)
    // The stops that carry no flicker hold still while it moves.
    expect(later.alphas[1]).toBeCloseTo(early.alphas[1], 9)
  })

  test('burns brighter as the pointer nears the flame', () => {
    const lantern = createLantern()
    lantern.init(noImage, contained)
    const dark = recorder()
    lantern.draw(dark.context, contained, 0)

    lantern.pointer(FLAME.x, FLAME.y, 'move')
    const settling = recorder()
    let level = 0
    for (let frame = 1; frame <= 60; frame += 1) {
      lantern.draw(settling.context, contained, frame * 16)
      level += (1 - level) * 0.12
    }

    // Both measured frames carry the same timestamp, so the flicker is where
    // it was and the difference belongs to the pointer alone.
    const lit = recorder()
    expect(lantern.draw(lit.context, contained, 0)).toBe(true)
    // The measured frame closes its own step of the gap before it paints.
    level += (1 - level) * 0.12
    // The first stop is the bloom's core, and a pointer on the flame lifts it
    // by half again. It cannot double any more: the lantern now burns most of
    // its light with nobody there, and the pointer's share is what is left.
    expect(lit.alphas[0]).toBeGreaterThan(dark.alphas[0] * 1.5)
    expect(lit.alphas[0]).toBeCloseTo(0.088 * (REST + level * 0.37) * flickerAt(0), 9)
    expect(brightness(lit.alphas)).toBeGreaterThan(brightness(dark.alphas))

    // The halo opens as it brightens.
    const halos = marksOf(lit.marks, 'createRadialGradient')
    // The bloom, the halo, the two panes, and the spill the pointer brought.
    expect(halos).toHaveLength(5)
    expect(halos[0].radius).toBeCloseTo(SHORT * (0.138 + level * 0.03), 9)
    expect(halos[1].radius).toBeCloseTo(SHORT * (0.058 + level * 0.014), 9)

    // The spill on the water is the pointer's alone: a flattened pool below
    // the flame, turned to the angle the water sits at.
    expect(count(dark.calls, 'ellipse')).toBe(0)
    const spills = marksOf(lit.marks, 'ellipse')
    expect(spills).toHaveLength(1)
    expect(halos[4].x).toBeCloseTo(contained.frame.left + contained.frame.width * FLAME.x, 9)
    expect(halos[4].y).toBeCloseTo(contained.frame.top + contained.frame.height * 0.405, 9)
    expect(halos[4].radius).toBeCloseTo(SHORT * 0.078, 9)
    expect(halos[4].second).toBe(0)
    expect(spills[0].x).toBeCloseTo(halos[4].x, 9)
    expect(spills[0].y).toBeCloseTo(halos[4].y, 9)
    expect(spills[0].radius).toBeCloseTo(SHORT * 0.078 * 1.28, 9)
    expect(spills[0].second).toBeCloseTo(SHORT * 0.078 * 0.68, 9)
    expect(spills[0].rotation).toBe(-0.08)
    expect(spills[0].from).toBe(0)
    expect(spills[0].to).toBe(Math.PI * 2)

    expect(lit.alphas).toHaveLength(17)
    expect(lit.alphas[14]).toBeCloseTo(0.12 * level * flickerAt(0), 9)
    expect(lit.alphas[15]).toBeCloseTo(0.052 * level, 9)
    expect(lit.alphas[16]).toBe(0)
    expect(lit.colors.slice(14)).toEqual(['255, 190, 104', '246, 145, 77', '238, 124, 68'])
    expect(lit.offsets.slice(14)).toEqual([0, 0.5, 1])
  })

  test('answers a pointer by how far it is from the flame', () => {
    const half = createLantern()
    half.init(noImage, contained)
    half.pointer(FLAME.x + REACH / 2, FLAME.y, 'move')
    const settling = recorder()
    for (let frame = 1; frame <= 60; frame += 1) {
      half.draw(settling.context, contained, frame * 16)
    }

    // Half way in, half the answer. Sixty frames leave the level a hair short
    // of its target, which is why this reads to three places and not nine.
    const held = recorder()
    half.draw(held.context, contained, 0)
    expect(held.alphas[0]).toBeCloseTo(0.088 * (REST + 0.5 * 0.37) * flickerAt(0), 3)

    // At the edge of the reach the answer is none, and the lantern asks for no
    // more frames.
    const edge = createLantern()
    edge.init(noImage, contained)
    edge.pointer(FLAME.x + REACH, FLAME.y, 'move')
    expect(edge.draw(recorder().context, contained, 0)).toBe(false)

    // The reach is a circle on the art: the same distance downward answers
    // the same.
    const below = createLantern()
    below.init(noImage, contained)
    below.pointer(FLAME.x, FLAME.y + REACH / 2, 'move')
    const settlingBelow = recorder()
    for (let frame = 1; frame <= 60; frame += 1) {
      below.draw(settlingBelow.context, contained, frame * 16)
    }
    const heldBelow = recorder()
    below.draw(heldBelow.context, contained, 0)
    expect(heldBelow.alphas[0]).toBeCloseTo(held.alphas[0], 9)
  })

  test('comes back to rest when the pointer goes away', () => {
    const away = [
      { nx: 1.3, ny: 0.5, kind: 'move' as const },
      { nx: -0.2, ny: 0.5, kind: 'move' as const },
      { nx: FLAME.x, ny: FLAME.y, kind: 'leave' as const },
    ]

    for (const { nx, ny, kind } of away) {
      const lantern = createLantern()
      lantern.init(noImage, contained)
      const paint = recorder()
      lantern.pointer(FLAME.x, FLAME.y, 'move')
      expect(lantern.draw(paint.context, contained, 0)).toBe(true)

      lantern.pointer(nx, ny, kind)
      let frames = 0
      while (lantern.draw(paint.context, contained, frames * 16) && frames < 200) {
        frames += 1
      }

      // A pointer that is off the art asks for no light, however it left. One
      // lit frame puts the level at about an eighth, and closing an eighth of
      // the gap each frame takes nineteen more to come under a hundredth.
      expect(frames).toBe(19)
    }
  })

  test('goes back to its own burn when it is disposed', () => {
    const lantern = createLantern()
    lantern.init(noImage, contained)
    lantern.pointer(FLAME.x, FLAME.y, 'move')
    const settling = recorder()
    for (let frame = 1; frame <= 60; frame += 1) {
      lantern.draw(settling.context, contained, frame * 16)
    }

    lantern.dispose()
    const after = recorder()
    // Nothing is held: no pointer, no light above the burn, no spill.
    expect(lantern.draw(after.context, contained, 0)).toBe(false)
    expect(after.alphas[0]).toBeCloseTo(0.088 * REST * flickerAt(0), 9)
    expect(count(after.calls, 'ellipse')).toBe(0)
  })

  test('holds a press where the last move left it', () => {
    const lantern = createLantern()
    lantern.init(noImage, contained)
    lantern.pointer(FLAME.x, FLAME.y, 'move')
    lantern.pointer(1.3, 1.3, 'down')
    const paint = recorder()

    expect(lantern.draw(paint.context, contained, 0)).toBe(true)
  })

  test('puts the flame on the art, not on the canvas', () => {
    const lantern = createLantern()
    lantern.init(noImage, covering)
    const paint = recorder()
    lantern.draw(paint.context, covering, 0)

    const halo = marksOf(paint.marks, 'createRadialGradient')[1]
    expect(halo.x).toBeCloseTo(covering.frame.left + covering.frame.width * FLAME.x, 6)
    expect(halo.y).toBeCloseTo(covering.frame.top + covering.frame.height * FLAME.y, 6)
    // The same fraction of the canvas lands somewhere else entirely, which is
    // the whole reason the frame carries the conversion.
    expect(Math.abs(halo.x - covering.canvas.width * FLAME.x)).toBeGreaterThan(15)
    // The radii follow the frame's shorter side, not the canvas's.
    expect(halo.radius).toBeCloseTo(
      Math.min(covering.frame.width, covering.frame.height) * 0.058,
      9,
    )
  })
})

describe('the fireflies', () => {
  test('have no field until they are started', () => {
    const fireflies = createFireflies()
    const paint = recorder()

    expect(fireflies.draw(paint.context, contained, 0)).toBe(false)
    expect(paint.calls).toEqual([])

    fireflies.init(noImage, contained)
    expect(fireflies.draw(paint.context, contained, 0)).toBe(true)

    fireflies.dispose()
    expect(fireflies.draw(paint.context, contained, 0)).toBe(false)
  })

  test('paint a halo and a body for every light, on the art', () => {
    const fireflies = createFireflies()
    fireflies.init(noImage, contained)
    const paint = recorder()
    fireflies.draw(paint.context, contained, 0)

    const arcs = marksOf(paint.marks, 'arc')
    expect(arcs).toHaveLength(20)

    FIELD.forEach((light, index) => {
      const halo = arcs[index * 2]
      const body = arcs[index * 2 + 1]
      const place = lightPlace(light, 0)
      const strength = lightStrength(light, 0)

      // Every light sits on the art, and its body sits inside its halo.
      expect(halo.x).toBeGreaterThan(contained.frame.left)
      expect(halo.x).toBeLessThan(contained.frame.left + contained.frame.width)
      expect(halo.y).toBeGreaterThan(contained.frame.top)
      expect(halo.y).toBeLessThan(contained.frame.top + contained.frame.height)
      expect(body.x).toBeCloseTo(halo.x, 9)
      expect(body.y).toBeCloseTo(halo.y, 9)

      expect(halo.x).toBeCloseTo(place.x, 9)
      expect(halo.y).toBeCloseTo(place.y, 9)
      // A halo is a point of light in pixels, sized by how bright its own
      // light burns and by nothing else. The body answers the pulse as well.
      expect(halo.radius).toBeCloseTo(11 + light.glow * 3, 9)
      expect(body.radius).toBeCloseTo(1.35 + strength * 0.85, 9)
      // Both are whole circles, and the halo opens from a point.
      for (const round of [halo, body]) {
        expect(round.from).toBe(0)
        expect(round.to).toBe(Math.PI * 2)
      }
      expect(marksOf(paint.marks, 'createRadialGradient')[index].second).toBe(0)

      expect(paint.alphas[index * 4]).toBeCloseTo(0.98 * strength, 9)
      expect(paint.alphas[index * 4 + 1]).toBeCloseTo(0.58 * strength, 9)
      expect(paint.alphas[index * 4 + 2]).toBe(0)
      expect(paint.alphas[index * 4 + 3]).toBeCloseTo(0.96 * strength, 9)
    })

    // Pale gold out to a warm edge that carries no opacity, and a body paler
    // than any of it.
    expect(paint.colors).toEqual(FIELD.flatMap(() => LIGHT_COLORS))
    expect(paint.offsets).toEqual(FIELD.flatMap(() => [0, 0.2, 1]))
  })

  test('wander and pulse with the clock', () => {
    const fireflies = createFireflies()
    fireflies.init(noImage, contained)
    const first = recorder()
    const later = recorder()

    fireflies.draw(first.context, contained, 0)
    fireflies.draw(later.context, contained, 4000)

    const before = marksOf(first.marks, 'arc')
    const after = marksOf(later.marks, 'arc')
    expect(after.some((arc, index) => Math.abs(arc.x - before[index].x) > 0.5)).toBe(true)
    expect(brightness(later.alphas)).not.toBeCloseTo(brightness(first.alphas), 6)

    // Four seconds in, every light has moved on its own clock and none of
    // them has left its own place on the art.
    FIELD.forEach((light, index) => {
      const place = lightPlace(light, 4000)
      expect(after[index * 2].x).toBeCloseTo(place.x, 9)
      expect(after[index * 2].y).toBeCloseTo(place.y, 9)
      expect(later.alphas[index * 4]).toBeCloseTo(0.98 * lightStrength(light, 4000), 9)
      expect(after[index * 2 + 1].radius).toBeCloseTo(
        1.35 + lightStrength(light, 4000) * 0.85,
        9,
      )
    })
  })

  test('ignore the pointer', () => {
    const fireflies = createFireflies()
    fireflies.init(noImage, contained)
    const before = recorder()
    fireflies.draw(before.context, contained, 500)

    fireflies.pointer(FIELD[0].x, FIELD[0].y, 'move')
    fireflies.pointer(0.2, 0.2, 'leave')
    const after = recorder()
    fireflies.draw(after.context, contained, 500)

    expect(after.marks).toEqual(before.marks)
    expect(after.alphas).toEqual(before.alphas)
  })
})

describe('the flowers', () => {
  test('rest with no petals and no pointer', () => {
    const flowers = createFlowers()
    flowers.init(noImage, contained)
    const paint = recorder()

    expect(flowers.draw(paint.context, contained, 1000)).toBe(false)
    expect(paint.calls).toEqual([])
  })

  test('send a petal up from the bed the pointer opened', () => {
    // Both compositions: the bed is a fraction of the art, and the art is not
    // where the canvas is once the frame hangs outside it.
    for (const scene of [contained, covering]) {
      fixedRandom()
      const flowers = createFlowers()
      flowers.init(noImage, scene)
      flowers.pointer(BED.x, BED.y, 'move')
      const paint = recorder()

      expect(flowers.draw(paint.context, scene, OPENING[0])).toBe(true)
      expect(count(paint.calls, 'ellipse')).toBe(0)
      flowers.draw(paint.context, scene, OPENING[1])
      expect(count(paint.calls, 'ellipse')).toBe(0)
      flowers.draw(paint.context, scene, OPENING[2])
      expect(count(paint.calls, 'ellipse')).toBe(1)

      // Half a radius around the bed's middle, and up by the offset that puts
      // the start among the blooms rather than under them.
      const origin = petalOrigin(BED)
      const spots = marksOf(paint.marks, 'translate')
      expect(spots).toHaveLength(1)
      expect(spots[0].x).toBeCloseTo(scene.frame.left + scene.frame.width * origin.nx, 6)
      expect(spots[0].y).toBeCloseTo(scene.frame.top + scene.frame.height * origin.ny, 6)

      // A petal is a long thin ellipse, drawn on the point it was moved to.
      const shapes = marksOf(paint.marks, 'ellipse')
      expect(shapes[0].x).toBe(0)
      expect(shapes[0].y).toBe(0)
      expect(shapes[0].radius).toBeCloseTo(PETAL.size * 1.82, 9)
      expect(shapes[0].second).toBeCloseTo(PETAL.size * 0.68, 9)
      expect(shapes[0].rotation).toBe(0)
      expect(shapes[0].from).toBe(0)
      expect(shapes[0].to).toBe(Math.PI * 2)
      expect(paint.colors).toEqual(['255, 162, 125'])
      // At birth it carries only its own phase.
      expect(marksOf(paint.marks, 'rotate')[0].rotation).toBe(PETAL.phase)

      // A frame inside the spacing carries no second petal: what paints again
      // is the one already up.
      flowers.draw(paint.context, scene, OPENING[2] + 50)
      expect(count(paint.calls, 'ellipse')).toBe(2)
      expect(marksOf(paint.marks, 'translate')).toHaveLength(2)
    }
  })

  test('hold the petals in flight to a count the frame can carry', () => {
    // A life at the top of its range brings more petals in than leave, so the
    // oldest is dropped to make room for the newest.
    fixedRandom(PETAL_RANDOM.map((value, index) => (index === 8 ? 1 : value)))
    const flowers = createFlowers()
    flowers.init(noImage, contained)
    flowers.pointer(BED.x, BED.y, 'move')

    let most = 0
    for (let frame = 0; frame < 40; frame += 1) {
      const paint = recorder()
      flowers.draw(paint.context, contained, 1000 + frame * 100)
      most = Math.max(most, count(paint.calls, 'ellipse'))
    }

    expect(most).toBe(18)
  })

  test('take the petal from the bed the pointer is nearest', () => {
    for (const bed of BEDS) {
      fixedRandom()
      const flowers = createFlowers()
      flowers.init(noImage, contained)
      flowers.pointer(bed.x, bed.y, 'move')
      const paint = recorder()
      for (const now of OPENING) flowers.draw(paint.context, contained, now)

      const origin = petalOrigin(bed)
      const spots = marksOf(paint.marks, 'translate')
      expect(spots).toHaveLength(1)
      expect(spots[0].x).toBeCloseTo(
        contained.frame.left + contained.frame.width * origin.nx,
        6,
      )
      expect(spots[0].y).toBeCloseTo(
        contained.frame.top + contained.frame.height * origin.ny,
        6,
      )
    }
  })

  test('carry the petal on its own drift, turning and fading as it goes', () => {
    fixedRandom()
    const flowers = createFlowers()
    flowers.init(noImage, contained)
    flowers.pointer(BED.x, BED.y, 'move')
    const paint = recorder()

    let level = 0
    for (const now of OPENING) {
      flowers.draw(paint.context, contained, now)
      level += (1 - level) * 0.09
    }

    // The bed closes, so nothing new joins the one in flight and the level
    // falls by the same fraction on each frame that follows.
    flowers.pointer(BED.x, BED.y, 'leave')
    const early = recorder()
    flowers.draw(early.context, contained, 1400)
    const earlyLevel = level - level * 0.09
    const late = recorder()
    flowers.draw(late.context, contained, 1800)
    const lateLevel = earlyLevel - earlyLevel * 0.09

    expect(marksOf(early.marks, 'translate')).toHaveLength(1)
    expect(marksOf(late.marks, 'translate')).toHaveLength(1)

    const origin = petalOrigin(BED)
    const startX = contained.frame.left + contained.frame.width * origin.nx
    const startY = contained.frame.top + contained.frame.height * origin.ny
    const drift = 0.25 * 0.018 * contained.frame.width
    const climb = -(0.055 + 0.5 * 0.04) * contained.frame.height

    // Sideways at its own speed with a sway over the top of it, upward at its
    // own speed with the rise easing off over the whole life.
    const placeAt = (age: number) => ({
      x: startX + drift * (age / 1000) + Math.sin(PETAL.phase + (age / PETAL.duration) * 6) * 5,
      y: startY + climb * (age / 1000) - Math.sin((age / PETAL.duration) * Math.PI) * 8,
    })

    expect(marksOf(early.marks, 'translate')[0].x).toBeCloseTo(placeAt(200).x, 9)
    expect(marksOf(early.marks, 'translate')[0].y).toBeCloseTo(placeAt(200).y, 9)
    expect(marksOf(late.marks, 'translate')[0].x).toBeCloseTo(placeAt(600).x, 9)
    expect(marksOf(late.marks, 'translate')[0].y).toBeCloseTo(placeAt(600).y, 9)
    expect(marksOf(late.marks, 'translate')[0].y).toBeLessThan(
      marksOf(early.marks, 'translate')[0].y,
    )

    // The turn is the petal's phase carried on by its spin.
    expect(marksOf(early.marks, 'rotate')[0].rotation).toBeCloseTo(
      PETAL.phase + (200 / PETAL.duration) * PETAL.spin,
      9,
    )

    // The fade: in over the first seventh of the life, out on a curve over
    // all of it, and lifted by the strength of the flow it came from. This
    // petal is a coral one, which is carried a little further.
    const alphaAt = (age: number, flow: number) =>
      Math.min(
        1,
        Math.min(1, (age / PETAL.duration) * 7) *
          Math.pow(1 - age / PETAL.duration, 1.45) *
          (0.62 + flow * 0.38) *
          1.18,
      )

    expect(early.alphas[0]).toBeCloseTo(alphaAt(200, earlyLevel), 9)
    expect(late.alphas[0]).toBeCloseTo(alphaAt(600, lateLevel), 9)
    expect(late.alphas[0]).toBeLessThan(early.alphas[0])
  })

  test('keep the frames coming while a petal is up, and stop when it is not', () => {
    fixedRandom()
    const flowers = createFlowers()
    flowers.init(noImage, contained)
    flowers.pointer(BED.x, BED.y, 'move')
    const paint = recorder()
    for (const now of OPENING) flowers.draw(paint.context, contained, now)
    flowers.pointer(BED.x, BED.y, 'leave')

    // Forty frames of a sixtieth of a second: the level is long under a
    // hundredth by then, so the petal alone is what answers.
    for (let frame = 1; frame <= 40; frame += 1) {
      expect(flowers.draw(paint.context, contained, 1200 + frame * 16)).toBe(true)
    }
    const alive = recorder()
    expect(flowers.draw(alive.context, contained, 1200 + 40 * 16)).toBe(true)
    expect(count(alive.calls, 'ellipse')).toBe(1)

    // Its life is over to the millisecond, and it is gone.
    const over = recorder()
    expect(flowers.draw(over.context, contained, 1200 + PETAL.duration)).toBe(false)
    expect(over.calls).toEqual([])
  })

  test('paint the cream petals without the coral lift', () => {
    fixedRandom(CREAM_RANDOM)
    const flowers = createFlowers()
    flowers.init(noImage, contained)
    flowers.pointer(BED.x, BED.y, 'move')
    const paint = recorder()

    let level = 0
    for (const now of OPENING) {
      flowers.draw(paint.context, contained, now)
      level += (1 - level) * 0.09
    }
    flowers.pointer(BED.x, BED.y, 'leave')
    const late = recorder()
    flowers.draw(late.context, contained, 1400)

    const age = 200
    const fade =
      Math.min(1, (age / PETAL.duration) * 7) * Math.pow(1 - age / PETAL.duration, 1.45)
    expect(late.alphas[0]).toBeCloseTo(fade * (0.62 + (level - level * 0.09) * 0.38), 9)
    expect(late.colors).toEqual(['255, 226, 166'])
  })

  test('answer a pointer by how far it is across the bed', () => {
    // One radius out on either axis, and on both at once: the distance is
    // measured in the bed's own radius, so all three are the same distance
    // away and none of them opens the bed.
    const probes = [
      { nx: BED.x + BED.radiusX, ny: BED.y },
      { nx: BED.x, ny: BED.y + BED.radiusY },
      { nx: BED.x + BED.radiusX * 0.6, ny: BED.y + BED.radiusY * 0.8 },
    ]

    for (const probe of probes) {
      const flowers = createFlowers()
      flowers.init(noImage, contained)
      flowers.pointer(probe.nx, probe.ny, 'move')
      const paint = recorder()

      let now = 1000
      for (let frame = 0; frame < 200; frame += 1) {
        // A sixth of the flow is under what the bed opens at, so the level
        // climbs to it and stops there.
        expect(flowers.draw(paint.context, contained, now)).toBe(true)
        now += 100
      }

      expect(count(paint.calls, 'ellipse')).toBe(0)

      // The pointer goes off the art. Nothing is in flight, so the level is
      // the only thing left to settle: a fall from a sixth, nine hundredths
      // of the way each frame, comes under a hundredth on the twenty-ninth.
      flowers.pointer(1.3, probe.ny, 'move')
      let frames = 0
      while (flowers.draw(paint.context, contained, now) && frames < 200) {
        frames += 1
        now += 100
      }
      expect(frames).toBe(29)
    }
  })

  test('close the bed when the pointer falls out of its reach', () => {
    const flowers = createFlowers()
    flowers.init(noImage, contained)
    flowers.pointer(BED.x, BED.y, 'move')
    const paint = recorder()
    for (const now of OPENING) flowers.draw(paint.context, contained, now)
    expect(count(paint.calls, 'ellipse')).toBe(1)

    // A target of five hundredths, under what a bed has to earn. The level is
    // still above the gate, so the closed bed is the only thing that can hold
    // the next petal back.
    flowers.pointer(BED.x + BED.radiusX * 1.14, BED.y, 'move')
    flowers.draw(paint.context, contained, 1300)
    expect(count(paint.calls, 'ellipse')).toBe(2)

    // A target of three tenths does earn the bed, and the flow starts once
    // the level has climbed to the gate.
    const near = createFlowers()
    near.init(noImage, contained)
    near.pointer(BED.x + BED.radiusX * 0.84, BED.y, 'move')
    const flow = recorder()
    for (let frame = 0; frame < 20; frame += 1) {
      near.draw(flow.context, contained, 1000 + frame * 100)
    }
    expect(count(flow.calls, 'ellipse')).toBeGreaterThan(0)
  })

  test('close the bed the moment the pointer leaves the hero', () => {
    const flowers = createFlowers()
    flowers.init(noImage, contained)
    flowers.pointer(BED.x, BED.y, 'move')
    const paint = recorder()
    for (const now of OPENING) flowers.draw(paint.context, contained, now)
    expect(count(paint.calls, 'ellipse')).toBe(1)

    flowers.pointer(BED.x, BED.y, 'leave')
    flowers.draw(paint.context, contained, 1300)
    // The level is still above the gate the bed opens at, so the closed bed
    // is the only thing that can hold the next petal back. What paints is the
    // one already in flight.
    expect(count(paint.calls, 'ellipse')).toBe(2)
  })

  test('thin out when the pointer only leaves the art', () => {
    // Past either edge of the art, on either axis.
    for (const off of [
      { nx: 1.3, ny: 0.5 },
      { nx: 0.5, ny: 1.3 },
      { nx: -0.3, ny: -0.3 },
    ]) {
      const flowers = createFlowers()
      flowers.init(noImage, contained)
      flowers.pointer(BED.x, BED.y, 'move')
      const paint = recorder()
      for (const now of OPENING) flowers.draw(paint.context, contained, now)

      flowers.pointer(off.nx, off.ny, 'move')
      flowers.draw(paint.context, contained, 1300)
      // Off the art the target drops but the bed stays open, so the level's
      // own fall is what closes it: this frame still carries a new petal
      // beside the one in flight.
      expect(count(paint.calls, 'ellipse')).toBe(3)

      let frames = 0
      let now = 1400
      while (flowers.draw(paint.context, contained, now) && frames < 400) {
        frames += 1
        now += 16
      }

      // The last petals live under two seconds, and the level settles well
      // inside that.
      expect(frames).toBeGreaterThan(0)
      expect(frames).toBeLessThan(300)
    }
  })

  test('drop the petals in flight when the frame changes', () => {
    const flowers = createFlowers()
    flowers.init(noImage, contained)
    flowers.pointer(BED.x, BED.y, 'move')
    const paint = recorder()
    for (const now of OPENING) flowers.draw(paint.context, contained, now)
    expect(count(paint.calls, 'ellipse')).toBe(1)

    flowers.resize(covering)
    const after = recorder()
    flowers.draw(after.context, covering, 1250)
    // A petal's pixels belong to the frame it left the bed on, and that frame
    // is gone.
    expect(count(after.calls, 'ellipse')).toBe(0)
  })

  test('end the flow when they are disposed', () => {
    const flowers = createFlowers()
    flowers.init(noImage, contained)
    flowers.pointer(BED.x, BED.y, 'move')
    const paint = recorder()
    for (const now of OPENING) flowers.draw(paint.context, contained, now)

    flowers.dispose()
    const after = recorder()
    expect(flowers.draw(after.context, contained, 1300)).toBe(false)
    expect(after.calls).toEqual([])
  })
})

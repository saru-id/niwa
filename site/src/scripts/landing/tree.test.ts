import { afterEach, describe, expect, test, vi } from 'vitest'

import { createCanopy } from './canopy'
import { computeScene } from './geometry'
import { createNeedles } from './needles'
import { GUST_GAP_MS, GUST_MS, PADS, gustOn, padUnderPointer } from './pine'
import { pointInPond } from './water'

/* The pine: its shape, the wind that crosses it, and what falls out of it.
 *
 * The three modules are tested together because they are one thing seen at
 * three depths — the pads, the light on them, and what leaves them — and the
 * facts that matter are the ones that hold across the seams: a pad the gust
 * has not reached yet does not shed, and a needle that comes down on the
 * water hands the strike on exactly once.
 */

/** The hero art's own pixel size. */
const ART = { w: 1536, h: 1024 }

/** The art contained in the wrap, which is the composition the tree is drawn
 *  in. The entry does not call either effect in the other one. */
const scene = computeScene(
  { left: 184.328125, top: 0, width: 1351.671875, height: 1024 },
  ART,
  false,
  1,
)

/** Neither effect reads the art's pixels, so `init` has nothing to take. */
const noImage = null as unknown as HTMLImageElement

/** The pad the wind reaches last, which is the one that stands out over the
 *  water. It is the only pad whose needles can reach the pond. */
const OVERHANG = PADS.length - 1

/** A canvas that keeps what was asked of it rather than drawing anything. */
function recorder() {
  const calls: string[] = []
  const alphas: number[] = []
  const composites: string[] = []
  const strokes: string[] = []
  const points: { x: number; y: number }[] = []
  const stack: string[] = []

  let composite = 'source-over'

  const context = {
    globalAlpha: 1,
    lineWidth: 1,
    lineCap: 'butt',
    fillStyle: '' as unknown,
    strokeStyle: '' as unknown,
    get globalCompositeOperation(): string {
      return composite
    },
    set globalCompositeOperation(value: string) {
      composites.push(value)
      composite = value
    },
    save() {
      calls.push('save')
      stack.push(composite)
    },
    restore() {
      calls.push('restore')
      const held = stack.pop()
      if (held === undefined) throw new Error('a restore with no save before it')
      composite = held
    },
    translate() {
      calls.push('translate')
    },
    scale() {
      calls.push('scale')
    },
    beginPath() {
      calls.push('beginPath')
    },
    moveTo(x: number, y: number) {
      calls.push('moveTo')
      points.push({ x, y })
    },
    lineTo(x: number, y: number) {
      calls.push('lineTo')
      points.push({ x, y })
    },
    arc(x: number, y: number) {
      calls.push('arc')
      points.push({ x, y })
    },
    fill() {
      calls.push('fill')
      const read = /^rgba\([^)]*,\s*([0-9.e+-]+)\)$/.exec(String(context.fillStyle))
      if (read !== null) alphas.push(Number(read[1]))
    },
    stroke() {
      calls.push('stroke')
      strokes.push(String(context.strokeStyle))
      alphas.push(context.globalAlpha)
    },
    createRadialGradient() {
      calls.push('createRadialGradient')
      return {
        addColorStop(_offset: number, color: string) {
          const read = /^rgba\([^)]*,\s*([0-9.e+-]+)\)$/.exec(color)
          if (read !== null) alphas.push(Number(read[1]))
        },
      }
    },
  }

  return {
    context: context as unknown as CanvasRenderingContext2D,
    calls,
    alphas,
    composites,
    strokes,
    points,
    depth: () => stack.length,
    clear() {
      calls.length = 0
      alphas.length = 0
      composites.length = 0
      strokes.length = 0
      points.length = 0
    },
  }
}

/** Every random a needle is built from, in the order `release` takes them.
 *  All nothing: the needle is born at its pad's middle and takes the floor of
 *  every range, so where it goes can be stated exactly. */
const fixedRandom = (value = 0) => {
  vi.spyOn(Math, 'random').mockImplementation(() => value)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the pine', () => {
  test('meets its pads in one order, from the trunk outward', () => {
    const wind = PADS.map((pad) => pad.at)
    expect(wind).toEqual([...wind].sort((a, b) => a - b))
    expect(wind[0]).toBe(0)
    expect(wind[wind.length - 1]).toBe(1)
    // The order is the wind's, and the wind blows out over the water. A pad
    // met later therefore stands further left on the art, and the last one is
    // the only pad whose needles have any chance of reaching the pond.
    const across = PADS.map((pad) => pad.x)
    expect(across).toEqual([...across].sort((a, b) => b - a))
  })

  test('a gust is strongest on the pad it has reached', () => {
    for (const pad of PADS) {
      expect(gustOn(pad, pad.at)).toBeCloseTo(1, 9)
      // It arrives at nothing and leaves at nothing, with no step at either
      // end: a front with a corner on it reads as a light switching on.
      expect(gustOn(pad, pad.at - 0.4)).toBe(0)
      expect(gustOn(pad, pad.at + 0.4)).toBe(0)
      expect(gustOn(pad, pad.at + 0.17)).toBeGreaterThan(0)
      expect(gustOn(pad, pad.at + 0.17)).toBeLessThan(1)
    }
  })

  test('a gust reaches one pad before the next', () => {
    const first = PADS[0]
    const last = PADS[PADS.length - 1]
    expect(gustOn(first, 0)).toBeGreaterThan(gustOn(last, 0))
    expect(gustOn(last, 1)).toBeGreaterThan(gustOn(first, 1))
  })

  test('a pointer is measured in a pad’s own radii, not the frame’s', () => {
    const pad = PADS[2]
    expect(padUnderPointer(pad, pad.x, pad.y)).toBe(1)
    expect(padUnderPointer(pad, pad.x + pad.radiusX * 2, pad.y)).toBe(0)

    // The pad is far wider than it is tall, so one distance is not one answer:
    // the same step across it and down it reaches differently into it, and a
    // step that is still on the pad sideways is already off it downwards. A
    // round reach would answer both the same and hand a long flat pad the
    // response of a ball.
    const step = pad.radiusX
    expect(padUnderPointer(pad, pad.x, pad.y + step)).toBeLessThan(
      padUnderPointer(pad, pad.x + step, pad.y),
    )

    // How far the answer carries on each axis, found rather than assumed, so
    // this holds whatever the reach is set to. A pad is flatter than it is
    // wide, so it must run out sooner downwards than sideways.
    const carry = (step: (distance: number) => number) => {
      let distance = 0
      while (distance < 1 && step(distance) > 0) distance += 0.0005
      return distance
    }
    const sideways = carry((d) => padUnderPointer(pad, pad.x + d, pad.y))
    const downwards = carry((d) => padUnderPointer(pad, pad.x, pad.y + d))
    expect(downwards).toBeLessThan(sideways)
    expect(downwards / sideways).toBeCloseTo(pad.radiusY / pad.radiusX, 2)
  })

  test('the pad the wind leaves last is the one over the water', () => {
    const pad = PADS[OVERHANG]
    // Its left edge overhangs the pond; its middle does not. That is the
    // whole geometry the needles depend on, and it is a fact about the art.
    expect(pad.x - pad.radiusX).toBeLessThan(0.6)
    expect(PADS.filter((one) => one.x - one.radiusX < 0.6)).toHaveLength(1)
  })
})

describe('the canopy', () => {
  const lit = () => {
    const canopy = createCanopy()
    canopy.init(noImage, scene)
    return canopy
  }

  test('rests dark, and says it has nothing to animate', () => {
    const canopy = lit()
    const paper = recorder()

    fixedRandom()
    expect(canopy.draw(paper.context, scene, 1000)).toBe(false)
    expect(paper.calls).toEqual(['save', 'restore'])
    expect(canopy.stirring(0)).toBe(0)
  })

  test('a gust crosses the tree, reaching the near pads first', () => {
    const canopy = lit()
    const paper = recorder()

    fixedRandom()
    canopy.draw(paper.context, scene, 0)

    // The gap is fixed by the random above, so the gust is due exactly here.
    const began = GUST_GAP_MS
    canopy.draw(paper.context, scene, began + 1)
    for (let step = 0; step < 6; step += 1) {
      canopy.draw(paper.context, scene, began + 1 + step * 16)
    }

    const near = canopy.stirring(0)
    const far = canopy.stirring(PADS.length - 1)
    expect(near).toBeGreaterThan(0)
    expect(near).toBeGreaterThan(far)

    // Half a gust later the far side is the lit one and the near side has
    // been left behind, which is the travel the whole effect is for.
    for (let now = began; now <= began + GUST_MS; now += 16) {
      canopy.draw(paper.context, scene, now)
    }
    expect(canopy.stirring(PADS.length - 1)).toBeGreaterThan(canopy.stirring(0))
  })

  test('a hover lifts the pad under it and leaves its neighbours alone', () => {
    const canopy = lit()
    const paper = recorder()
    const pad = PADS[2]

    fixedRandom()
    canopy.pointer(pad.x, pad.y, 'move')
    for (let step = 0; step < 40; step += 1) {
      canopy.draw(paper.context, scene, 1000 + step * 16)
    }

    expect(canopy.stirring(2)).toBeGreaterThan(0.5)
    for (const [index] of PADS.entries()) {
      if (index === 2) continue
      expect(canopy.stirring(index)).toBeLessThan(0.2)
    }
  })

  test('a hover that ends puts every pad back', () => {
    const canopy = lit()
    const paper = recorder()
    const pad = PADS[2]

    fixedRandom()
    canopy.pointer(pad.x, pad.y, 'move')
    for (let step = 0; step < 40; step += 1) {
      canopy.draw(paper.context, scene, 1000 + step * 16)
    }
    canopy.pointer(-1, -1, 'leave')
    for (let step = 0; step < 120; step += 1) {
      canopy.draw(paper.context, scene, 2000 + step * 16)
    }

    expect(canopy.stirring(2)).toBeLessThan(0.01)
  })

  test('adds light rather than laying ink over the needles', () => {
    const canopy = lit()
    const paper = recorder()
    const pad = PADS[2]

    fixedRandom()
    canopy.pointer(pad.x, pad.y, 'move')
    for (let step = 0; step < 40; step += 1) {
      canopy.draw(paper.context, scene, 1000 + step * 16)
    }
    paper.clear()
    canopy.draw(paper.context, scene, 2000)

    expect(paper.composites).toContain('screen')
    // Every save is answered, so the composite never escapes the pass into
    // the effects drawn after it.
    expect(paper.depth()).toBe(0)
  })

  test('never gets bright enough to read as a lamp in the tree', () => {
    const canopy = lit()
    const paper = recorder()

    fixedRandom()
    for (const pad of PADS) canopy.pointer(pad.x, pad.y, 'move')
    for (let step = 0; step < 200; step += 1) {
      paper.clear()
      canopy.draw(paper.context, scene, 1000 + step * 16)
      // The wash's own ceiling, and half again for a spark, which is a
      // needle's width across and may carry a little more than the wash it
      // sits in without becoming the brighter event.
      for (const alpha of paper.alphas) expect(alpha).toBeLessThanOrEqual(0.14 * 1.5)
    }
  })

  test('forgets its wind when it is disposed', () => {
    const canopy = lit()
    const paper = recorder()
    const pad = PADS[2]

    fixedRandom()
    canopy.pointer(pad.x, pad.y, 'move')
    for (let step = 0; step < 40; step += 1) {
      canopy.draw(paper.context, scene, 1000 + step * 16)
    }
    canopy.dispose()

    expect(canopy.stirring(2)).toBe(0)
    expect(canopy.draw(paper.context, scene, 3000)).toBe(false)
  })
})

describe('the needles', () => {
  /** A tree where the named pads are being worked and the rest are still. */
  const shedding = (...stirred: number[]) => {
    const landings: { nx: number; ny: number; strength: number }[] = []
    const needles = createNeedles({
      stirring: (index) => (stirred.includes(index) ? 1 : 0),
      onWater: (nx, ny, strength) => {
        landings.push({ nx, ny, strength })
      },
    })
    needles.init(noImage, scene)
    return { needles, landings }
  }

  test('a still tree sheds nothing', () => {
    const { needles } = shedding()
    const paper = recorder()

    fixedRandom()
    for (let step = 0; step < 60; step += 1) {
      expect(needles.draw(paper.context, scene, 1000 + step * 16)).toBe(false)
    }
    expect(paper.calls.filter((call) => call === 'stroke')).toHaveLength(0)
  })

  test('a working pad sheds on a beat, not on every frame', () => {
    const { needles } = shedding(2)
    const paper = recorder()

    fixedRandom()
    // Four seconds of frames at sixty a second is 240 chances to shed, and the
    // spacing turns that into a few. A pad shedding per frame would empty the
    // tree into the pond in a second and a half; a pad shedding several times
    // a second reads as weather rather than as a tree letting go.
    for (let step = 0; step < 240; step += 1) {
      needles.draw(paper.context, scene, 1000 + step * 16)
    }
    paper.clear()
    needles.draw(paper.context, scene, 1000 + 240 * 16)
    // One frame, so this counts what is in the air rather than how often it
    // was drawn. Two strokes to a fascicle: a pine needle falls in pairs.
    const air = paper.calls.filter((call) => call === 'moveTo').length / 2
    expect(air).toBeGreaterThan(1)
    expect(air).toBeLessThan(6)
  })

  test('a needle falls, and slips towards the water as it turns', () => {
    // One needle and no others, so the two samples are the same needle. A
    // shedding pad would have put a second one in the air by the second
    // sample, and the draw walks the air newest first.
    let shedding = true
    const needles = createNeedles({
      stirring: (index) => (shedding && index === OVERHANG ? 1 : 0),
      onWater: () => {},
    })
    needles.init(noImage, scene)
    const paper = recorder()

    fixedRandom()
    // Past the pad's own spacing, so it has actually let go before the clock
    // the samples are taken on starts.
    const born = 2000
    needles.draw(paper.context, scene, born)
    shedding = false

    // A needle fades in over its first quarter second rather than appearing
    // on top of the pad it left, so the first frames draw nothing to compare.
    for (let step = 1; step < 20; step += 1) {
      needles.draw(paper.context, scene, born + step * 16)
    }
    paper.clear()
    needles.draw(paper.context, scene, born + 20 * 16)
    const first = paper.points[0]
    paper.clear()
    for (let step = 21; step < 60; step += 1) {
      needles.draw(paper.context, scene, born + step * 16)
    }
    const later = paper.points[0]

    expect(later.y).toBeGreaterThan(first.y)
    expect(later.x).toBeLessThan(first.x)
  })

  test('a needle that comes down on the pond strikes it, once', () => {
    const { needles, landings } = shedding(OVERHANG)
    const paper = recorder()

    fixedRandom()
    for (let step = 0; step < 200; step += 1) {
      needles.draw(paper.context, scene, 1000 + step * 50)
    }

    expect(landings.length).toBeGreaterThan(0)
    for (const landing of landings) {
      expect(pointInPond(landing.nx, landing.ny)).toBe(true)
      // Well under a pointer's own pass over the water. A needle should be
      // noticed landing, not announced.
      expect(landing.strength).toBeLessThan(0.8)
    }
  })

  test('a needle off any other pad falls clear of the water', () => {
    // Every pad but the one that overhangs. None of them stands over the
    // pond, so nothing they drop can reach it however long it falls.
    const { needles, landings } = shedding(0, 1, 2, 3, 4, 5)
    const paper = recorder()

    fixedRandom()
    for (let step = 0; step < 200; step += 1) {
      needles.draw(paper.context, scene, 1000 + step * 50)
    }

    expect(landings).toEqual([])
  })

  test('holds the sky to a bounded number of needles', () => {
    const { needles } = shedding(0, 1, 2, 3, 4, 5, 6)
    const paper = recorder()

    fixedRandom()
    for (let step = 0; step < 400; step += 1) {
      paper.clear()
      needles.draw(paper.context, scene, 1000 + step * 16)
      expect(paper.calls.filter((call) => call === 'moveTo').length / 2).toBeLessThanOrEqual(
        22,
      )
    }
  })

  test('empties the sky when it is disposed', () => {
    const { needles } = shedding(2)
    const paper = recorder()

    fixedRandom()
    for (let step = 0; step < 60; step += 1) {
      needles.draw(paper.context, scene, 1000 + step * 16)
    }
    needles.dispose()
    paper.clear()

    // The clock started over with it. A pad that is still being worked sheds
    // again on the next frame, and that needle has to be born at its pad —
    // a draw that measured against the last frame before the dispose would
    // carry it eighty-nine seconds down the art on the frame it appeared.
    needles.draw(paper.context, scene, 90_000)
    needles.draw(paper.context, scene, 90_300)
    const born = paper.points[0]
    expect(born.y / scene.frame.height).toBeLessThan(PADS[2].y + 0.1)
  })
})

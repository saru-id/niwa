import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { computeScene, LANDING_QUERY, type Rect } from './geometry'
import { start } from './index'

const stubs = vi.hoisted(() => {
  const drawn: string[] = []
  const life: string[] = []
  const pointers: { name: string; nx: number; ny: number; kind: string }[] = []
  const animating = new Set<string>()
  /** The scene each effect was last built or rebuilt against. */
  const held = new Map<string, { canvas: { width: number; height: number } }>()
  /** Effects whose pixels cannot be read, the way a tainted canvas reads. */
  const failing = new Set<string>()
  /** Every strike the pond took from something that is not the pointer. */
  const drops: { nx: number; ny: number; strength: number }[] = []
  /** How hard each pad is being worked, as the canopy would answer. */
  const stirred = new Map<number, number>()
  /** The ports the entry wired the needles up with, so a test can pull them. */
  const wiring: {
    stirring?: (index: number) => number
    onWater?: (nx: number, ny: number, strength: number) => void
  } = {}

  const make = (name: string) => ({
    init(_image: unknown, scene: { canvas: { width: number; height: number } }): void {
      life.push(`init:${name}`)
      held.set(name, scene)
      if (failing.has(name)) throw new Error(`${name} cannot read its pixels`)
    },
    resize(scene: { canvas: { width: number; height: number } }): void {
      life.push(`resize:${name}`)
      held.set(name, scene)
    },
    draw(): boolean {
      drawn.push(name)
      return animating.has(name)
    },
    pointer(nx: number, ny: number, kind: string): void {
      pointers.push({ name, nx, ny, kind })
    },
    dispose(): void {
      life.push(`dispose:${name}`)
    },
  })

  return { drawn, life, pointers, animating, held, failing, make, drops, stirred, wiring }
})

vi.mock('./effects', () => ({
  createRipples: () => ({
    ...stubs.make('ripples'),
    drop(nx: number, ny: number, strength: number): void {
      stubs.drops.push({ nx, ny, strength })
    },
  }),
  createBasin: () => stubs.make('basin'),
  createLantern: () => stubs.make('lantern'),
  createCanopy: () => ({
    ...stubs.make('canopy'),
    stirring: (index: number) => stubs.stirred.get(index) ?? 0,
  }),
  createFireflies: () => stubs.make('fireflies'),
  createFlowers: () => stubs.make('flowers'),
  createNeedles: (ports: {
    stirring: (index: number) => number
    onWater: (nx: number, ny: number, strength: number) => void
  }) => {
    stubs.wiring.stirring = ports.stirring
    stubs.wiring.onWater = ports.onWater
    return stubs.make('needles')
  },
}))

/** The hero art's own pixel size. */
const ART = { w: 1536, h: 1024 }

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

type Handler = (event: unknown) => void

class Target {
  readonly handlers = new Map<string, Handler[]>()

  addEventListener(type: string, handler: Handler): void {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler])
  }

  removeEventListener(type: string, handler: Handler): void {
    const left = (this.handlers.get(type) ?? []).filter((one) => one !== handler)
    this.handlers.set(type, left)
  }

  dispatch(type: string, event: unknown = {}): void {
    for (const handler of [...(this.handlers.get(type) ?? [])]) handler(event)
  }

  listening(type: string): number {
    return (this.handlers.get(type) ?? []).length
  }
}

class FakeMedia {
  matches: boolean
  private readonly handlers: Handler[] = []

  constructor(matches: boolean) {
    this.matches = matches
  }

  addEventListener(_type: 'change', handler: Handler): void {
    this.handlers.push(handler)
  }

  removeEventListener(_type: 'change', handler: Handler): void {
    const at = this.handlers.indexOf(handler)
    if (at >= 0) this.handlers.splice(at, 1)
  }

  set(matches: boolean): void {
    this.matches = matches
    for (const handler of [...this.handlers]) handler({})
  }

  listening(): number {
    return this.handlers.length
  }
}

interface Options {
  mobile?: boolean
  reduced?: boolean
  dpr?: number
  wrap?: { width: number; height: number }
  idle?: boolean
  complete?: boolean
}

function environment(options: Options = {}) {
  const mobile = options.mobile ?? false
  const box = options.wrap ?? (mobile ? { width: 390, height: 844 } : { width: 1352, height: 1024 })

  const rect = (width: number, height: number): Rect => ({ left: 0, top: 0, width, height })

  const transforms: number[] = []
  const cleared: Rect[] = []
  const context = {
    setTransform(a: number, _b: number, _c: number, _d: number, _e: number, _f: number): void {
      transforms.push(a)
    },
    clearRect(left: number, top: number, width: number, height: number): void {
      cleared.push({ left, top, width, height })
    },
  }

  const canvas = {
    width: 300,
    height: 150,
    style: {} as Record<string, string>,
    getContext: () => context,
    getBoundingClientRect: (): Rect => canvasBox,
  }
  let canvasBox: Rect = rect(0, 0)

  const wrap = { getBoundingClientRect: (): Rect => rect(box.width, box.height) }
  const image = {
    naturalWidth: ART.w,
    naturalHeight: ART.h,
    decode: () => decoding,
  }
  let decoding: Promise<void> = Promise.resolve()

  const hero = new Target()
  const elements = new Map<string, unknown>([
    ['.hero', hero],
    ['.hero-art-wrap', wrap],
    ['.hero-art', image],
    ['.pond-ripples', canvas],
  ])

  const media = new Map<string, FakeMedia>([
    [REDUCED_MOTION, new FakeMedia(options.reduced ?? false)],
    [LANDING_QUERY, new FakeMedia(mobile)],
  ])

  const frames: FrameRequestCallback[] = []
  const idles: (() => void)[] = []
  let clock = 0

  const window = Object.assign(new Target(), {
    devicePixelRatio: options.dpr ?? 1,
    matchMedia(query: string): FakeMedia {
      const found = media.get(query)
      if (found === undefined) throw new Error(`no media double for ${query}`)
      return found
    },
    requestAnimationFrame(callback: FrameRequestCallback): number {
      frames.push(callback)
      return frames.length
    },
    cancelAnimationFrame(id: number): void {
      frames[id - 1] = () => {}
    },
    setTimeout(callback: () => void, delay: number): number {
      return globalThis.setTimeout(callback, delay) as unknown as number
    },
    clearTimeout(id: number): void {
      globalThis.clearTimeout(id)
    },
    ...(options.idle === false
      ? {}
      : {
          requestIdleCallback(callback: () => void): number {
            idles.push(callback)
            return idles.length
          },
        }),
  })

  const observers = { intersection: [] as unknown[], resize: [] as unknown[] }
  let notifyIntersection: ((entries: { isIntersecting: boolean }[]) => void) | undefined
  let notifyResize: (() => void) | undefined
  let intersectionOptions: unknown
  let disconnected = 0

  class FakeIntersectionObserver {
    constructor(callback: (entries: { isIntersecting: boolean }[]) => void, given: unknown) {
      notifyIntersection = callback
      intersectionOptions = given
    }
    observe(target: unknown): void {
      observers.intersection.push(target)
    }
    unobserve(): void {}
    disconnect(): void {
      disconnected += 1
    }
  }

  class FakeResizeObserver {
    constructor(callback: () => void) {
      notifyResize = callback
    }
    observe(target: unknown): void {
      observers.resize.push(target)
    }
    unobserve(): void {}
    disconnect(): void {
      disconnected += 1
    }
  }

  const document = Object.assign(new Target(), {
    readyState: options.complete === true ? 'complete' : 'loading',
    visibilityState: 'visible',
    querySelector(selector: string): unknown {
      return elements.get(selector) ?? null
    },
  })

  const define = (name: string, value: unknown): void => {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
  }
  define('window', window)
  define('document', document)
  define('IntersectionObserver', FakeIntersectionObserver)
  define('ResizeObserver', FakeResizeObserver)

  const runFrames = (): number => {
    const pending = frames.splice(0, frames.length)
    clock += 16
    for (const callback of pending) callback(clock)
    return pending.length
  }

  return {
    hero,
    canvas,
    image,
    window,
    document,
    context,
    transforms,
    cleared,
    observers,
    frames,
    idles,
    reduced: media.get(REDUCED_MOTION) as FakeMedia,
    narrow: media.get(LANDING_QUERY) as FakeMedia,
    scene: () => computeScene(rect(box.width, box.height), ART, mobile, options.dpr ?? 1),
    intersectionOptions: () => intersectionOptions,
    disconnected: () => disconnected,
    canvasBox(next: Rect): void {
      canvasBox = next
    },
    resizeTo(width: number, height: number): void {
      box.width = width
      box.height = height
    },
    decodesWith(promise: Promise<void>): void {
      decoding = promise
    },
    see(visible: boolean): void {
      notifyIntersection?.([{ isIntersecting: visible }])
    },
    notifyResize(): void {
      notifyResize?.()
    },
    runFrames,
    /** Drain the idle queue, letting the decode's promise settle between. */
    async runIdle(): Promise<void> {
      for (let round = 0; round < 24; round += 1) {
        idles.shift()?.()
        await Promise.resolve()
      }
    },
    pointer(type: string, event: Record<string, unknown> = {}): void {
      hero.dispatch(type, { clientX: 0, clientY: 0, pointerType: 'mouse', ...event })
    },
  }
}

/** Start the scene the way a browser does: load, then the floor, then idle. */
async function begin(env: ReturnType<typeof environment>, visible = true): Promise<void> {
  start()
  env.see(visible)
  env.window.dispatch('load')
  vi.advanceTimersByTime(2000)
  await env.runIdle()
}

beforeEach(() => {
  vi.useFakeTimers()
  stubs.drawn.length = 0
  stubs.life.length = 0
  stubs.pointers.length = 0
  stubs.animating.clear()
  stubs.held.clear()
  stubs.failing.clear()
  stubs.drops.length = 0
  stubs.stirred.clear()
})

afterEach(() => {
  vi.useRealTimers()
  for (const name of ['window', 'document', 'IntersectionObserver', 'ResizeObserver']) {
    Reflect.deleteProperty(globalThis, name)
  }
})

describe('the start', () => {
  test('reads nothing and observes nothing until the hero is on screen', async () => {
    const env = environment()
    start()
    env.window.dispatch('load')

    // The observers arm at once. The effects do not.
    expect(env.observers.intersection).toEqual([env.hero])
    expect(env.observers.resize.length).toBe(1)
    expect(env.intersectionOptions()).toEqual({ threshold: 0.02 })
    expect(stubs.life).toEqual([])

    vi.advanceTimersByTime(2000)
    await env.runIdle()
    expect(stubs.life).toEqual([])
  })

  test('waits the full two seconds after load', async () => {
    const env = environment()
    start()
    env.see(true)
    env.window.dispatch('load')

    vi.advanceTimersByTime(1999)
    await env.runIdle()
    expect(stubs.life).toEqual([])

    vi.advanceTimersByTime(1)
    await env.runIdle()
    expect(stubs.life).toEqual([
      'init:ripples',
      'init:basin',
      'init:lantern',
      'init:canopy',
      'init:fireflies',
      'init:flowers',
      'init:needles',
    ])
  })

  test('never starts for a reader who left the hero inside those seconds', async () => {
    const env = environment()
    start()
    env.see(true)
    env.see(false)
    env.window.dispatch('load')

    vi.advanceTimersByTime(2000)
    await env.runIdle()
    expect(stubs.life).toEqual([])

    // The observer is what holds the start, so coming back releases it.
    env.see(true)
    await env.runIdle()
    expect(stubs.life).toContain('init:ripples')
  })

  test('decodes the art before the first sample, and only once', async () => {
    const env = environment()
    const order: string[] = []
    env.decodesWith(
      Promise.resolve().then(() => {
        order.push('decode')
      }),
    )
    start()
    env.see(true)
    env.window.dispatch('load')
    vi.advanceTimersByTime(2000)
    await env.runIdle()

    order.push(...stubs.life)
    expect(order[0]).toBe('decode')
    expect(order[1]).toBe('init:ripples')
  })

  test('builds nothing when the art will not decode', async () => {
    const env = environment()
    env.decodesWith(Promise.reject(new Error('no pixels')))
    start()
    env.see(true)
    env.window.dispatch('load')
    vi.advanceTimersByTime(2000)
    await env.runIdle()

    expect(stubs.life).toEqual([])
  })

  test('asks the art to decode again on the next look at the hero', async () => {
    const env = environment()
    env.decodesWith(Promise.reject(new Error('no pixels')))
    start()
    env.see(true)
    env.window.dispatch('load')
    vi.advanceTimersByTime(2000)
    await env.runIdle()
    expect(stubs.life).toEqual([])

    // A refusal stands the start down instead of wedging it, so a hero that
    // gains a decodable source builds on the next look.
    env.decodesWith(Promise.resolve())
    env.see(false)
    env.see(true)
    await env.runIdle()
    expect(stubs.life).toContain('init:ripples')
  })

  test('stands down when the reader scrolls on during the idle wait', async () => {
    const env = environment()
    start()
    env.see(true)
    env.window.dispatch('load')
    vi.advanceTimersByTime(2000)
    // The hero leaves after the idle start is queued but before it runs.
    env.see(false)
    await env.runIdle()
    expect(stubs.life).toEqual([])

    env.see(true)
    await env.runIdle()
    expect(stubs.life).toContain('init:ripples')
  })

  test('spreads the build over separate idle pieces', async () => {
    const env = environment()
    start()
    env.see(true)
    env.window.dispatch('load')
    vi.advanceTimersByTime(2000)

    // One piece is asked for at a time: the queue never holds two.
    const depths: number[] = []
    for (let round = 0; round < 12; round += 1) {
      depths.push(env.idles.length)
      env.idles.shift()?.()
      await Promise.resolve()
    }
    expect(Math.max(...depths)).toBe(1)
    expect(stubs.life.length).toBe(7)
  })

  test('runs on a browser with no idle callback', async () => {
    const env = environment({ idle: false })
    start()
    env.see(true)
    env.window.dispatch('load')

    vi.advanceTimersByTime(2000)
    for (let round = 0; round < 12; round += 1) {
      vi.advanceTimersByTime(1)
      await Promise.resolve()
    }
    expect(stubs.life.length).toBe(7)
  })

  test('starts on a page that has already loaded', async () => {
    const env = environment({ complete: true })
    start()
    env.see(true)
    vi.advanceTimersByTime(2000)
    await env.runIdle()

    expect(stubs.life.length).toBe(7)
  })

  test('does nothing at all on a page without a hero', () => {
    environment()
    Object.defineProperty(globalThis, 'document', {
      value: { querySelector: () => null, addEventListener: () => {} },
      configurable: true,
      writable: true,
    })
    expect(() => {
      start()
    }).not.toThrow()
    expect(stubs.life).toEqual([])
  })
})

describe('an effect that cannot build', () => {
  const ATTEMPTED = [
    'init:ripples',
    'init:basin',
    'init:lantern',
    'init:canopy',
    'init:fireflies',
    'init:flowers',
    'init:needles',
  ]
  const DRAWN = ['ripples', 'basin', 'lantern', 'canopy', 'fireflies', 'flowers', 'needles']

  test('leaves the effects behind it their turn', async () => {
    const env = environment()
    stubs.failing.add('lantern')

    // Nothing escapes: a page whose art cannot be read is a still page, not
    // a broken one.
    await expect(begin(env)).resolves.toBeUndefined()
    expect(stubs.life).toEqual(ATTEMPTED)
  })

  test('leaves the scene drawing without it', async () => {
    const env = environment()
    stubs.failing.add('lantern')
    await begin(env)

    // The chain reached its end, so the loop is armed. Every gated effect is
    // still called: the entry does not know which of them holds pixels, and
    // one that holds none draws nothing and answers false.
    expect(env.runFrames()).toBe(1)
    expect(stubs.drawn).toEqual(DRAWN)
    expect(env.frames.length).toBe(1)
  })

  test('holds nothing up when it is the first of them', async () => {
    const env = environment()
    stubs.failing.add('ripples')

    await expect(begin(env)).resolves.toBeUndefined()
    expect(stubs.life).toEqual(ATTEMPTED)

    env.runFrames()
    expect(stubs.drawn).toEqual(DRAWN)
  })

  test('leaves a scene when every one of them fails', async () => {
    const env = environment()
    for (const name of DRAWN) stubs.failing.add(name)

    await expect(begin(env)).resolves.toBeUndefined()
    expect(stubs.life).toEqual(ATTEMPTED)

    env.runFrames()
    expect(stubs.drawn).toEqual(DRAWN)
  })

  test('still catches every effect up after a resize landed mid-build', async () => {
    const env = environment()
    stubs.failing.add('basin')
    const first = env.scene().canvas.width
    start()
    env.see(true)
    env.window.dispatch('load')
    vi.advanceTimersByTime(2000)

    for (let round = 0; round < 4; round += 1) {
      env.idles.shift()?.()
      await Promise.resolve()
    }
    expect(stubs.life).toEqual(['init:ripples', 'init:basin'])

    env.resizeTo(1000, 800)
    env.notifyResize()
    env.runFrames()
    await expect(env.runIdle()).resolves.toBeUndefined()

    const wanted = env.scene().canvas.width
    expect(wanted).not.toBe(first)
    for (const name of DRAWN) {
      expect(stubs.held.get(name)?.canvas.width).toBe(wanted)
    }
  })
})

describe('the backing store', () => {
  const store = async (mobile: boolean, dpr: number) => {
    const env = environment({ mobile, dpr })
    await begin(env)
    return { env, scene: env.scene() }
  }

  for (const dpr of [1, 1.75, 2, 3]) {
    test(`carries the desktop density at a ratio of ${dpr}`, async () => {
      const { env, scene } = await store(false, dpr)
      expect(scene.density).toBe(Math.min(dpr, 2))
      expect(env.canvas.width).toBe(Math.round(scene.canvas.width * scene.density))
      expect(env.canvas.height).toBe(Math.round(scene.canvas.height * scene.density))
      expect(env.transforms).toEqual([scene.density])
    })

    test(`carries the phone density at a ratio of ${dpr}`, async () => {
      const { env, scene } = await store(true, dpr)
      expect(scene.density).toBe(Math.min(dpr, 1.25))
      expect(env.canvas.width).toBe(Math.round(scene.canvas.width * scene.density))
      expect(env.canvas.height).toBe(Math.round(scene.canvas.height * scene.density))
      expect(env.transforms).toEqual([scene.density])
    })
  }

  test('places the canvas where the scene says the art is', async () => {
    const { env, scene } = await store(false, 2)
    expect(env.canvas.style.left).toBe(`${scene.canvas.left}px`)
    expect(env.canvas.style.top).toBe(`${scene.canvas.top}px`)
    expect(env.canvas.style.width).toBe(`${scene.canvas.width}px`)
    expect(env.canvas.style.height).toBe(`${scene.canvas.height}px`)
  })

  test('clears in the units the transform draws in', async () => {
    const { env, scene } = await store(false, 2)
    env.runFrames()
    expect(env.cleared[0]).toEqual({
      left: 0,
      top: 0,
      width: scene.canvas.width,
      height: scene.canvas.height,
    })
  })
})

describe('the gate map', () => {
  const pass = async (options: Options & { seen: boolean }) => {
    const env = environment(options)
    await begin(env)
    if (!options.seen) env.see(false)
    stubs.drawn.length = 0
    env.runFrames()
    return { env, drawn: [...stubs.drawn] }
  }

  test('draws the whole scene on a desktop the reader is looking at', async () => {
    const { drawn } = await pass({ seen: true })
    expect(drawn).toEqual(['ripples', 'basin', 'lantern', 'canopy', 'fireflies', 'flowers', 'needles'])
  })

  test('holds the ambient three back on a phone', async () => {
    const { drawn } = await pass({ seen: true, mobile: true })
    expect(drawn).toEqual(['ripples', 'basin'])
  })

  test('leaves only the ripples once the hero is off screen', async () => {
    const { drawn } = await pass({ seen: false })
    expect(drawn).toEqual(['ripples'])
  })

  test('leaves only the ripples under reduced motion', async () => {
    const { drawn } = await pass({ seen: true, reduced: true })
    expect(drawn).toEqual(['ripples'])
  })

  test('leaves only the ripples on a phone with reduced motion', async () => {
    const { drawn } = await pass({ seen: true, reduced: true, mobile: true })
    expect(drawn).toEqual(['ripples'])
  })

  test('leaves only the ripples off screen on a phone', async () => {
    const { drawn } = await pass({ seen: false, mobile: true })
    expect(drawn).toEqual(['ripples'])
  })

  test('draws in the fixed order, every pass', async () => {
    const env = environment()
    await begin(env)
    stubs.drawn.length = 0
    env.runFrames()
    env.runFrames()
    expect(stubs.drawn).toEqual([
      'ripples',
      'basin',
      'lantern',
      'canopy',
      'fireflies',
      'flowers',
      'needles',
      'ripples',
      'basin',
      'lantern',
      'canopy',
      'fireflies',
      'flowers',
      'needles',
    ])
  })
})

describe('the reschedule', () => {
  const rest = async (options: Options) => {
    const env = environment(options)
    await begin(env)
    env.see(false)
    env.runFrames()
    return env
  }

  test('keeps running while the scene is awake, whatever the effects answer', async () => {
    const env = environment()
    await begin(env)
    expect(env.runFrames()).toBe(1)
    expect(env.frames.length).toBe(1)
  })

  test('stops once nothing is gated in and nothing is animating', async () => {
    const env = await rest({})
    expect(env.frames.length).toBe(0)
  })

  test('keeps running for a ripple still in flight off screen', async () => {
    stubs.animating.add('ripples')
    const env = await rest({})
    expect(env.frames.length).toBe(1)
  })

  test('ignores an effect it did not call', async () => {
    // The lantern is gated out off screen. What it would have answered is
    // not an answer.
    stubs.animating.add('lantern')
    const env = await rest({})
    expect(env.frames.length).toBe(0)
  })

  test('ignores the ambient three on a phone', async () => {
    stubs.animating.add('fireflies')
    stubs.animating.add('flowers')
    const env = await rest({ mobile: true })
    expect(env.frames.length).toBe(0)
  })

  test('wakes again when motion is allowed once more', async () => {
    const env = environment({ reduced: true })
    await begin(env)
    env.runFrames()
    expect(env.frames.length).toBe(0)

    env.reduced.set(false)
    expect(env.frames.length).toBe(1)
    stubs.drawn.length = 0
    env.runFrames()
    expect(stubs.drawn).toEqual(['ripples', 'basin', 'lantern', 'canopy', 'fireflies', 'flowers', 'needles'])
  })

  test('parks the scene when motion is turned off', async () => {
    const env = environment()
    await begin(env)
    env.reduced.set(true)
    stubs.drawn.length = 0
    env.runFrames()
    expect(stubs.drawn).toEqual(['ripples'])
    expect(env.cleared.length).toBeGreaterThan(0)
    expect(env.frames.length).toBe(0)
  })

  test('drops the pending frame while the tab is hidden', async () => {
    const env = environment()
    await begin(env)
    expect(env.frames.length).toBe(1)

    env.document.visibilityState = 'hidden'
    env.document.dispatch('visibilitychange')
    expect(env.runFrames()).toBe(1)
    expect(stubs.drawn.length).toBe(0)

    env.document.visibilityState = 'visible'
    env.document.dispatch('visibilitychange')
    expect(env.frames.length).toBe(1)
  })
})

describe('the resize', () => {
  test('settles a burst of notifications into one frame', async () => {
    const env = environment()
    await begin(env)
    env.runFrames()

    env.resizeTo(1000, 800)
    env.notifyResize()
    env.notifyResize()
    env.notifyResize()
    stubs.life.length = 0
    env.runFrames()

    expect(stubs.life).toEqual([
      'resize:ripples',
      'resize:basin',
      'resize:lantern',
      'resize:canopy',
      'resize:fireflies',
      'resize:flowers',
      'resize:needles',
    ])
  })

  test('rebuilds nothing when the scene did not move', async () => {
    const env = environment()
    await begin(env)
    env.runFrames()

    stubs.life.length = 0
    env.notifyResize()
    env.runFrames()
    expect(stubs.life).toEqual([])
  })

  test('re-applies the transform after the store is written', async () => {
    const env = environment({ dpr: 2 })
    await begin(env)
    env.runFrames()

    env.resizeTo(900, 700)
    env.notifyResize()
    env.runFrames()
    expect(env.transforms).toEqual([2, 2])
    expect(env.canvas.width).toBe(Math.round(900 * 2))
  })

  test('catches up the effects that were built before it landed', async () => {
    const env = environment()
    const first = env.scene().canvas.width
    start()
    env.see(true)
    env.window.dispatch('load')
    vi.advanceTimersByTime(2000)

    // The decode, the measurement, and the first two effects' buffers.
    for (let round = 0; round < 4; round += 1) {
      env.idles.shift()?.()
      await Promise.resolve()
    }
    expect(stubs.life).toEqual(['init:ripples', 'init:basin'])

    // The window moves between two pieces of the build.
    env.resizeTo(1000, 800)
    env.notifyResize()
    env.runFrames()
    expect(stubs.life).toEqual(['init:ripples', 'init:basin'])

    await env.runIdle()

    const wanted = env.scene().canvas.width
    expect(wanted).not.toBe(first)
    for (const name of ['ripples', 'basin', 'lantern', 'canopy', 'fireflies', 'flowers', 'needles']) {
      expect(stubs.held.get(name)?.canvas.width).toBe(wanted)
    }
    // Every effect is caught up once, at the end, rather than each build
    // piece asking whether the ground moved under it.
    expect(stubs.life.filter((one) => one.startsWith('resize:')).length).toBe(7)
  })

  test('re-measures when the breakpoint answers differently', async () => {
    const env = environment()
    await begin(env)
    env.runFrames()

    stubs.life.length = 0
    env.resizeTo(390, 844)
    env.narrow.set(true)
    expect(stubs.life).toEqual([
      'resize:ripples',
      'resize:basin',
      'resize:lantern',
      'resize:canopy',
      'resize:fireflies',
      'resize:flowers',
      'resize:needles',
    ])
  })
})

describe('the pointer', () => {
  const at = (env: ReturnType<typeof environment>, x: number, y: number) => {
    env.canvasBox({ left: 100, top: 40, width: env.scene().canvas.width, height: env.scene().canvas.height })
    env.pointer('pointermove', { clientX: x, clientY: y })
  }

  test('fans out normalized art coordinates', async () => {
    const env = environment()
    await begin(env)
    const scene = env.scene()
    at(env, 100 + scene.frame.width / 2, 40 + scene.frame.height / 4)

    expect(stubs.pointers.map((one) => one.name)).toEqual([
      'ripples',
      'basin',
      'lantern',
      'canopy',
      'fireflies',
      'flowers',
      'needles',
    ])
    expect(stubs.pointers[0]?.nx).toBeCloseTo(0.5, 9)
    expect(stubs.pointers[0]?.ny).toBeCloseTo(0.25, 9)
  })

  test('does not clamp what falls outside the art', async () => {
    const env = environment()
    await begin(env)
    at(env, 40, 20)

    expect(stubs.pointers[0]?.nx).toBeLessThan(0)
    expect(stubs.pointers[0]?.ny).toBeLessThan(0)
  })

  test('reads the canvas box again for every event', async () => {
    const env = environment()
    await begin(env)
    const scene = env.scene()

    env.canvasBox({ left: 0, top: 0, width: scene.canvas.width, height: scene.canvas.height })
    env.pointer('pointermove', { clientX: scene.frame.width / 2, clientY: 0 })
    // The wrap is sticky: the same page point is a different art point once
    // the box has moved under it.
    env.canvasBox({ left: 0, top: 300, width: scene.canvas.width, height: scene.canvas.height })
    env.pointer('pointermove', { clientX: scene.frame.width / 2, clientY: 0 })

    expect(stubs.pointers[0]?.ny).toBeCloseTo(0, 9)
    expect(stubs.pointers[7]?.ny).toBeLessThan(0)
  })

  test('ignores a touch', async () => {
    const env = environment()
    await begin(env)
    env.pointer('pointermove', { pointerType: 'touch' })
    env.pointer('pointerdown', { pointerType: 'touch' })
    expect(stubs.pointers).toEqual([])
  })

  test('gives a press to every effect while the scene is drawing', async () => {
    const env = environment()
    await begin(env)
    env.canvasBox({ left: 0, top: 0, width: 10, height: 10 })
    env.pointer('pointerdown', { clientX: 4, clientY: 6 })

    // The press arrives once. The water raises its own ripple from it, so
    // nothing here stands in for one.
    expect(stubs.pointers.map((one) => `${one.name}:${one.kind}`)).toEqual([
      'ripples:down',
      'basin:down',
      'lantern:down',
      'canopy:down',
      'fireflies:down',
      'flowers:down',
      'needles:down',
    ])
  })

  test('turns a press the scene would not draw into an end of the chain', async () => {
    const env = environment({ reduced: true })
    await begin(env)
    const frame = env.scene().frame
    env.canvasBox({ left: 0, top: 0, width: frame.width, height: frame.height })

    env.pointer('pointermove', { clientX: frame.width / 2, clientY: frame.height / 4 })
    expect(stubs.pointers).toEqual([])

    env.pointer('pointerdown', { clientX: frame.width / 2, clientY: frame.height / 4 })
    // The water alone hears it, and hears the reset without the ripple.
    expect(stubs.pointers.map((one) => `${one.name}:${one.kind}`)).toEqual(['ripples:leave'])
    // The place is the press's own, not a place off the art.
    expect(stubs.pointers[0]?.nx).toBeCloseTo(0.5, 9)
    expect(stubs.pointers[0]?.ny).toBeCloseTo(0.25, 9)
  })

  test('ends the chain for a press off screen too', async () => {
    const env = environment()
    await begin(env)
    env.see(false)
    stubs.pointers.length = 0

    env.pointer('pointerdown')
    expect(stubs.pointers.map((one) => `${one.name}:${one.kind}`)).toEqual(['ripples:leave'])
  })

  test('holds a move back while the hero is off screen, but not a leave', async () => {
    const env = environment()
    await begin(env)
    env.see(false)
    stubs.pointers.length = 0

    env.pointer('pointermove')
    expect(stubs.pointers).toEqual([])

    // A hover the reader has finished must end even where a move would not
    // have been heard.
    env.pointer('pointerleave')
    expect(stubs.pointers.map((one) => one.kind)).toEqual([
      'leave',
      'leave',
      'leave',
      'leave',
      'leave',
      'leave',
      'leave',
    ])
  })

  test('ends the hover under reduced motion too', async () => {
    const env = environment({ reduced: true })
    await begin(env)
    env.pointer('pointerleave')
    expect(stubs.pointers).toHaveLength(7)
    expect(stubs.pointers[0]?.kind).toBe('leave')
  })

  test('ends the hover when the hero scrolls away', async () => {
    const env = environment()
    await begin(env)
    stubs.pointers.length = 0

    // The pointer never moved, so no event is coming to say the hover is over.
    env.see(false)
    expect(stubs.pointers.map((one) => `${one.name}:${one.kind}`)).toEqual([
      'ripples:leave',
      'basin:leave',
      'lantern:leave',
      'canopy:leave',
      'fireflies:leave',
      'flowers:leave',
      'needles:leave',
    ])
    // The place it reports is off the art, which is where the pointer is.
    expect(stubs.pointers[0]?.nx).toBeLessThan(0)
    expect(stubs.pointers[0]?.ny).toBeLessThan(0)
  })

  test('ends no hover for a hero that never started', () => {
    const env = environment()
    start()
    env.see(true)
    env.see(false)
    expect(stubs.pointers).toEqual([])
  })

  test('sends nothing before the effects have their buffers', () => {
    const env = environment()
    start()
    env.see(true)
    env.pointer('pointerdown')
    expect(stubs.pointers).toEqual([])
  })

  test('names the kind the listener stands for', async () => {
    const env = environment()
    await begin(env)
    env.pointer('pointerleave')
    expect(stubs.pointers[0]?.kind).toBe('leave')
  })
})

describe('the teardown', () => {

  test('gives every effect its dispose and drops every listener', async () => {
    const env = environment()
    await begin(env)
    stubs.life.length = 0

    env.window.dispatch('pagehide', { persisted: false })

    expect(stubs.life).toEqual([
      'dispose:ripples',
      'dispose:basin',
      'dispose:lantern',
      'dispose:canopy',
      'dispose:fireflies',
      'dispose:flowers',
      'dispose:needles',
    ])
    expect(env.disconnected()).toBe(2)
    expect(env.hero.listening('pointermove')).toBe(0)
    expect(env.hero.listening('pointerdown')).toBe(0)
    expect(env.hero.listening('pointerleave')).toBe(0)
    expect(env.document.listening('visibilitychange')).toBe(0)
    expect(env.reduced.listening()).toBe(0)
    expect(env.narrow.listening()).toBe(0)
  })

  test('draws nothing after it', async () => {
    const env = environment()
    await begin(env)
    env.window.dispatch('pagehide', { persisted: false })
    stubs.drawn.length = 0
    env.runFrames()
    expect(stubs.drawn).toEqual([])
    expect(env.frames.length).toBe(0)
  })

  test('happens once, however many times the page hides', async () => {
    const env = environment()
    await begin(env)
    stubs.life.length = 0
    env.window.dispatch('pagehide', { persisted: false })
    env.window.dispatch('pagehide', { persisted: false })
    expect(stubs.life.length).toBe(7)
  })

  test('leaves a page held for a return alone', async () => {
    const env = environment()
    await begin(env)
    stubs.life.length = 0
    stubs.drawn.length = 0

    env.window.dispatch('pagehide', { persisted: true })

    expect(stubs.life).toEqual([])
    env.runFrames()
    expect(stubs.drawn).toEqual(['ripples', 'basin', 'lantern', 'canopy', 'fireflies', 'flowers', 'needles'])
  })
})


describe('the pine over the pond', () => {
  test('the needles read the canopy for which pads are moving', async () => {
    const env = environment()
    await begin(env)

    // The entry wires the two together and neither module imports the other,
    // so what is checked here is the wiring: the port the needles were handed
    // has to be the canopy's own answer and not a copy that can go stale.
    stubs.stirred.set(3, 0.75)
    expect(stubs.wiring.stirring?.(3)).toBe(0.75)
    expect(stubs.wiring.stirring?.(0)).toBe(0)

    stubs.stirred.set(3, 0)
    expect(stubs.wiring.stirring?.(3)).toBe(0)
  })

  test('a needle landing on the water strikes the pond', async () => {
    const env = environment()
    await begin(env)

    stubs.wiring.onWater?.(0.5, 0.7, 0.42)

    // The pond draws the ring, because the mask that keeps ripples on water
    // is composited at the end of the ripples' own pass: anything drawn after
    // it would sit on whatever it landed on, stone included.
    expect(stubs.drops).toEqual([{ nx: 0.5, ny: 0.7, strength: 0.42 }])
  })

  test('a landing is not a pointer, and does not move the pointer chain', async () => {
    const env = environment()
    await begin(env)
    stubs.pointers.length = 0

    stubs.wiring.onWater?.(0.5, 0.7, 0.42)

    // Nothing hears a landing except the water. A needle reported as a
    // pointer would light the lantern and open a flower bed on its way past.
    expect(stubs.pointers).toEqual([])
  })
})

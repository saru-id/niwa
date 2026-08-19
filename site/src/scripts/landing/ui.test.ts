import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { start } from './ui'

type Handler = (event: unknown) => void

class Target {
  readonly handlers = new Map<string, Handler[]>()
  readonly options = new Map<string, unknown>()

  addEventListener(type: string, handler: Handler, options?: unknown): void {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler])
    this.options.set(type, options)
  }

  dispatch(type: string, event: unknown = {}): void {
    for (const handler of this.handlers.get(type) ?? []) handler(event)
  }
}

class FakeElement extends Target {
  textContent: string | null = null
  parentElement: FakeElement | null = null
  disabled = false
  readonly classes = new Set<string>()
  readonly dataset: Record<string, string | undefined> = {}
  readonly classList = {
    add: (name: string): void => {
      this.classes.add(name)
    },
    remove: (name: string): void => {
      this.classes.delete(name)
    },
    toggle: (name: string, force: boolean): void => {
      if (force) this.classes.add(name)
      else this.classes.delete(name)
    },
  }

  /* What the trail writes and reads. The attributes are the current stop's
   * announcement, the properties are where the sprout was put, and the box is
   * the layout the script measures: a stop carries its own offset inside the
   * trail, and a section carries where it sits down the document. */
  readonly attributes = new Map<string, string>()
  readonly properties = new Map<string, string>()
  offsetLeft = 0
  offsetWidth = 0
  /** Where this element's top edge sits down the page, before any scroll. */
  documentTop = 0

  readonly style = {
    setProperty: (name: string, value: string): void => {
      this.properties.set(name, value)
    },
  }

  readonly matched: FakeElement[] = []

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value)
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name)
  }

  querySelectorAll(): FakeElement[] {
    return this.matched
  }

  getBoundingClientRect(): { top: number; left: number; width: number } {
    return {
      top: this.documentTop - (globalThis.window?.scrollY ?? 0),
      left: this.offsetLeft,
      width: this.offsetWidth,
    }
  }
}

const COMMAND = 'curl -fsSL https://niwa.rs | sh -s'

/** Let the clipboard's promise settle, which takes a microtask, not a timer. */
const settle = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function environment(
  clipboard?: { writeText?: (text: string) => Promise<void> },
  reduceMotion = false,
) {
  const bar = new FakeElement()
  const button = new FakeElement()
  button.textContent = 'Copy'
  const label = new FakeElement()
  label.textContent = 'Copy'
  const status = new FakeElement()
  status.textContent = ''

  // What the reader sees is a line with a prompt in it. The command is the
  // span inside that line, and the prompt is its sibling.
  const line = new FakeElement()
  line.textContent = `$ ${COMMAND}`
  const command = new FakeElement()
  command.textContent = COMMAND
  command.dataset.command = COMMAND
  command.parentElement = line

  // The write-back proof starts with the Mac changed and the config still at
  // its previous value. Pulling is the explicit step that reconciles them.
  const writeback = new FakeElement()
  const writebackToggle = new FakeElement()
  writebackToggle.setAttribute('aria-pressed', 'true')
  writebackToggle.classes.add('is-on')
  const writebackPull = new FakeElement()
  const writebackValue = new FakeElement()
  const writebackBefore = new FakeElement()
  writebackBefore.textContent = 'false'
  const writebackAfter = new FakeElement()
  writebackAfter.textContent = 'true'
  const writebackStatus = new FakeElement()
  writebackStatus.textContent = '1 change ready'
  const writebackAnnounce = new FakeElement()
  writebackAnnounce.textContent = ''

  /* The trail: three stops in a nav, and the section each one names. The
   * offsets are a plausible row of words, and the tops are a page with the
   * garden above the first section. `install` has no stop pointing at it
   * from `sections` alone — the pairing is the `data-trail-stop` attribute,
   * exactly as it is on the page. */
  const trail = new FakeElement()
  const sprout = new FakeElement()
  const sproutBody = new FakeElement()
  sprout.offsetWidth = 60
  const STOPS = [
    { id: 'why', left: 0, width: 69, top: 1170 },
    { id: 'config', left: 95, width: 45, top: 1700 },
    { id: 'install', left: 166, width: 42, top: 5230 },
  ]
  const sections = new Map<string, FakeElement>()

  for (const stop of STOPS) {
    const link = new FakeElement()
    link.dataset.trailStop = stop.id
    link.offsetLeft = stop.left
    link.offsetWidth = stop.width
    trail.matched.push(link)

    const section = new FakeElement()
    section.documentTop = stop.top
    sections.set(stop.id, section)
  }

  const elements = new Map<string, FakeElement>([
    ['.site-header', bar],
    ['[data-trail]', trail],
    ['[data-trail-sprout]', sprout],
    ['[data-trail-sprout-body]', sproutBody],
    ['[data-install-copy]', button],
    ['[data-install-label]', label],
    ['[data-install-status]', status],
    ['[data-command]', command],
    ['[data-writeback-demo]', writeback],
    ['[data-writeback-toggle]', writebackToggle],
    ['[data-writeback-pull]', writebackPull],
    ['[data-writeback-value]', writebackValue],
    ['[data-writeback-before]', writebackBefore],
    ['[data-writeback-after]', writebackAfter],
    ['[data-writeback-status]', writebackStatus],
    ['[data-writeback-announce]', writebackAnnounce],
  ])

  const selected: unknown[] = []
  const cleared: number[] = []
  const range = {
    node: undefined as unknown,
    selectNodeContents(node: unknown): void {
      this.node = node
    },
  }

  // Held mutable, because the script asks at each pull rather than at load:
  // a test can change the answer mid-visit the way a reader's settings can.
  const motion = { reduced: reduceMotion }

  const frames: FrameRequestCallback[] = []
  const window = Object.assign(new Target(), {
    scrollY: 0,
    innerHeight: 900,
    innerWidth: 1440,
    matchMedia(): { matches: boolean } {
      return { matches: motion.reduced }
    },
    requestAnimationFrame(callback: FrameRequestCallback): number {
      frames.push(callback)
      return frames.length
    },
    setTimeout(callback: () => void, delay: number): number {
      return globalThis.setTimeout(callback, delay) as unknown as number
    },
    clearTimeout(id: number): void {
      globalThis.clearTimeout(id)
    },
    getSelection() {
      return {
        removeAllRanges(): void {
          cleared.push(selected.length)
        },
        addRange(added: unknown): void {
          selected.push(added)
        },
      }
    },
  })

  const document = {
    // The page the sections sit on: the last of them ends 546 pixels down
    // from its own top, which is where the document stops.
    documentElement: { scrollHeight: 5776 },
    querySelector(selector: string): FakeElement | null {
      return elements.get(selector) ?? null
    },
    getElementById(id: string): FakeElement | null {
      return sections.get(id) ?? null
    },
    createRange() {
      return range
    },
  }

  const define = (name: string, value: unknown): void => {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
  }
  define('window', window)
  define('document', document)
  define('navigator', { clipboard })

  return {
    bar,
    trail,
    sprout,
    sproutBody,
    stops: trail.matched,
    sections,
    button,
    label,
    status,
    command,
    writeback,
    writebackToggle,
    writebackPull,
    writebackValue,
    writebackBefore,
    writebackAfter,
    writebackStatus,
    writebackAnnounce,
    line,
    range,
    selected,
    cleared,
    motion,
    window,
    scroll(to: number): void {
      window.scrollY = to
      window.dispatch('scroll')
    },
    /** The stop the trail says the reader is at, or none. */
    current(): string | undefined {
      return trail.matched.find((stop) => stop.attributes.has('aria-current'))?.dataset
        .trailStop
    },
    /** Where the sprout was put, and whether the trail shows it. */
    marker(): { transform: string | undefined; visible: boolean } {
      return {
        transform: sprout.properties.get('transform'),
        visible: trail.classes.has('has-current'),
      }
    },
    /** The little give inside the travelling marker. */
    plant(): { transform: string | undefined; duration: string | undefined } {
      return {
        transform: sproutBody.properties.get('transform'),
        duration: sproutBody.properties.get('transition-duration'),
      }
    },
    frames(): number {
      const pending = frames.splice(0, frames.length)
      for (const callback of pending) callback(0)
      return pending.length
    },
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  for (const name of ['window', 'document', 'navigator']) {
    Reflect.deleteProperty(globalThis, name)
  }
})

describe('the header scroll state', () => {
  test('reads the page position as soon as it loads', () => {
    const env = environment()
    env.window.scrollY = 400
    start()
    expect(env.bar.classes.has('is-scrolled')).toBe(true)
  })

  test('toggles across the twelve pixel boundary', () => {
    const env = environment()
    start()
    expect(env.bar.classes.has('is-scrolled')).toBe(false)

    env.scroll(12)
    env.frames()
    expect(env.bar.classes.has('is-scrolled')).toBe(false)

    env.scroll(13)
    env.frames()
    expect(env.bar.classes.has('is-scrolled')).toBe(true)

    env.scroll(12)
    env.frames()
    expect(env.bar.classes.has('is-scrolled')).toBe(false)
  })

  test('settles a burst of scrolling into one frame', () => {
    const env = environment()
    start()
    env.scroll(40)
    env.scroll(80)
    env.scroll(120)
    expect(env.frames()).toBe(1)
    expect(env.bar.classes.has('is-scrolled')).toBe(true)
  })

  test('listens passively, so the scroll never waits on it', () => {
    const env = environment()
    start()
    expect(env.window.options.get('scroll')).toEqual({ passive: true })
  })
})

describe('the write-back proof', () => {
  test('starts with the machine changed and one config edit ready', () => {
    const env = environment()
    start()

    expect(env.writebackToggle.attributes.get('aria-pressed')).toBe('true')
    expect(env.writebackBefore.textContent).toBe('false')
    expect(env.writebackValue.classes.has('is-diffing')).toBe(false)
    expect(env.writebackStatus.textContent).toBe('1 change ready')
    expect(env.writebackPull.attributes.get('aria-disabled')).toBe('false')
    // The page opens already saying this, so the live region has nothing to
    // add: a first render that wrote it would be announced over the arrival.
    expect(env.writebackAnnounce.textContent).toBe('')
  })

  test('pulls the machine value into the config and settles the motion', () => {
    const env = environment()
    start()
    env.writebackPull.dispatch('click')

    expect(env.writebackBefore.textContent).toBe('false')
    expect(env.writebackAfter.textContent).toBe('true')
    expect(env.writebackValue.classes.has('is-diffing')).toBe(true)
    expect(env.writebackStatus.textContent).toBe('1 change ready')
    // Dimmed, never disabled: the reader's focus is on this control right
    // now, and a disabled button would drop it on the floor.
    expect(env.writebackPull.attributes.get('aria-disabled')).toBe('true')
    expect(env.writebackPull.disabled).toBe(false)
    expect(env.writebackToggle.disabled).toBe(true)
    expect(env.writeback.classes.has('is-pulling')).toBe(true)

    vi.advanceTimersByTime(719)
    expect(env.writebackValue.classes.has('is-diffing')).toBe(true)
    expect(env.writebackValue.classes.has('is-committing')).toBe(false)
    expect(env.writebackBefore.textContent).toBe('false')

    vi.advanceTimersByTime(1)
    expect(env.writebackValue.classes.has('is-committing')).toBe(true)
    expect(env.writebackBefore.textContent).toBe('false')

    vi.advanceTimersByTime(559)
    expect(env.writeback.classes.has('is-pulling')).toBe(true)
    expect(env.writebackBefore.textContent).toBe('false')

    vi.advanceTimersByTime(1)
    expect(env.writebackBefore.textContent).toBe('true')
    expect(env.writebackValue.classes.has('is-diffing')).toBe(false)
    expect(env.writebackValue.classes.has('is-committing')).toBe(false)
    expect(env.writebackStatus.textContent).toBe('in sync')
    expect(env.writebackAnnounce.textContent).toBe('in sync')
    expect(env.writebackToggle.disabled).toBe(false)
    expect(env.writebackPull.attributes.get('aria-disabled')).toBe('true')
    expect(env.writeback.classes.has('is-synced')).toBe(true)
    expect(env.writeback.classes.has('is-pulling')).toBe(false)
  })

  test('creates drift again when the Mac changes later', () => {
    const env = environment()
    start()
    env.writebackPull.dispatch('click')
    vi.advanceTimersByTime(1280)
    env.writebackToggle.dispatch('click')

    expect(env.writebackToggle.attributes.get('aria-pressed')).toBe('false')
    expect(env.writebackBefore.textContent).toBe('true')
    expect(env.writebackStatus.textContent).toBe('1 change ready')
    expect(env.writebackAnnounce.textContent).toBe('1 change ready')
    expect(env.writeback.classes.has('is-synced')).toBe(false)
    expect(env.writebackPull.attributes.get('aria-disabled')).toBe('false')
  })

  test('settles without an intermediate animation when motion is reduced', () => {
    const env = environment(undefined, true)
    start()
    env.writebackPull.dispatch('click')

    expect(env.writebackBefore.textContent).toBe('true')
    expect(env.writebackValue.classes.has('is-diffing')).toBe(false)
    expect(env.writebackStatus.textContent).toBe('in sync')
    expect(env.writeback.classes.has('is-pulling')).toBe(false)
  })

  test('honours a motion setting changed after the page loaded', () => {
    const env = environment()
    start()

    env.motion.reduced = true
    env.writebackPull.dispatch('click')

    expect(env.writebackBefore.textContent).toBe('true')
    expect(env.writebackValue.classes.has('is-diffing')).toBe(false)
    expect(env.writeback.classes.has('is-pulling')).toBe(false)
  })
})

describe('the trail', () => {
  /* The reading line sits at 0.42 of a 900 pixel window, so a section counts
   * as reached once its top is 378 pixels down the viewport — that is, once
   * the page has been scrolled to its own top less 378. It holds there while
   * a viewport or more of page is still to come, which covers every probe
   * below but the last two. */
  const reaches = (top: number) => top - 900 * 0.42

  /** The furthest this page scrolls: its height less one window. */
  const BOTTOM = 5776 - 900

  test('is dark in the garden, above the first section', () => {
    const env = environment()
    start()

    expect(env.current()).toBeUndefined()
    expect(env.marker()).toEqual({ transform: undefined, visible: false })
  })

  test('marks the stop the reader has reached', () => {
    const env = environment()
    start()

    env.scroll(reaches(1170))
    env.frames()
    expect(env.current()).toBe('why')

    env.scroll(reaches(1700))
    env.frames()
    expect(env.current()).toBe('config')

    env.scroll(reaches(5230))
    env.frames()
    expect(env.current()).toBe('install')
  })

  test('marks one stop and no more', () => {
    const env = environment()
    start()

    env.scroll(reaches(5230))
    env.frames()

    expect(env.stops.filter((stop) => stop.attributes.has('aria-current'))).toHaveLength(1)
  })

  // The stop behind the reader keeps the sprout through the sections the trail
  // does not name, which is the whole stretch between the config and the last
  // word. A trail whose marker disappears reads as broken.
  test('holds the last stop passed through the sections between', () => {
    const env = environment()
    start()

    env.scroll(reaches(1700) + 1500)
    env.frames()
    expect(env.current()).toBe('config')
  })

  /* The last section's top stops 24 pixels short of the reading line however
   * far the page is scrolled, because the page runs out first. A line that
   * did not move for that left the final stop unmarked over the last two
   * dozen pixels of the scroll, which no reader would ever see. */
  test('reaches the last stop well before the page ends', () => {
    const env = environment()
    start()

    env.scroll(BOTTOM - 300)
    env.frames()
    expect(env.current()).toBe('install')
  })

  test('holds the last stop to the very bottom', () => {
    const env = environment()
    start()

    env.scroll(BOTTOM)
    env.frames()
    expect(env.current()).toBe('install')
  })

  // The slide belongs to the end of the page and nowhere else: with a
  // viewport or more still to come the line is exactly where it was, so the
  // stop before the last one is not handed the sprout early.
  test('does not slide the line while the page still has a viewport to give', () => {
    const env = environment()
    start()

    env.scroll(reaches(5230) - 900)
    env.frames()
    expect(env.current()).toBe('config')
  })

  test('closes above the first section without moving back to the origin', () => {
    const env = environment()
    start()

    env.scroll(reaches(1700))
    env.frames()
    expect(env.current()).toBe('config')

    env.scroll(0)
    env.frames()
    expect(env.current()).toBeUndefined()
    expect(env.marker()).toEqual({
      transform: 'translate3d(87.5px, 0, 0)',
      visible: false,
    })
  })

  // The marker is sixty pixels wide, so its centre meets the word's centre
  // without any word-specific offset.
  test('centres the sprout under the current stop', () => {
    const env = environment()
    start()

    env.scroll(reaches(1700))
    env.frames()

    expect(env.marker()).toEqual({
      transform: 'translate3d(87.5px, 0, 0)',
      visible: true,
    })
  })

  test('leans behind a move to the right, then relaxes', () => {
    const env = environment()
    start()

    env.scroll(reaches(1170))
    env.frames()
    expect(env.plant()).toEqual({ transform: undefined, duration: undefined })

    env.scroll(reaches(1700))
    env.frames()
    expect(env.plant()).toEqual({
      transform:
        'translate3d(0, 0, 0) skewX(-0.8deg) rotate(0.65deg) scaleX(0.996)',
      duration: '140ms',
    })

    vi.advanceTimersByTime(140)
    expect(env.plant()).toEqual({
      transform: 'translate3d(0, 0, 0) skewX(0deg) rotate(0deg) scaleX(1)',
      duration: '240ms',
    })
  })

  test('leans the other way when the trail moves left', () => {
    const env = environment()
    start()

    env.scroll(reaches(1700))
    env.frames()
    env.scroll(reaches(1170))
    env.frames()

    expect(env.plant()).toEqual({
      transform: 'translate3d(0, 0, 0) skewX(0.8deg) rotate(-0.65deg) scaleX(0.996)',
      duration: '140ms',
    })
  })

  test('retargets a rapid reversal instead of finishing stale motion', () => {
    const env = environment()
    start()

    env.scroll(reaches(1170))
    env.frames()
    env.scroll(reaches(1700))
    env.frames()
    vi.advanceTimersByTime(40)
    env.scroll(reaches(1170))
    env.frames()

    vi.advanceTimersByTime(100)
    expect(env.plant().transform).toContain('skewX(0.8deg)')
    vi.advanceTimersByTime(40)
    expect(env.plant()).toEqual({
      transform: 'translate3d(0, 0, 0) skewX(0deg) rotate(0deg) scaleX(1)',
      duration: '240ms',
    })
  })

  test('says where the reader is to someone who cannot see the sprout', () => {
    const env = environment()
    start()

    env.scroll(reaches(1170))
    env.frames()

    expect(env.stops[0].attributes.get('aria-current')).toBe('location')
  })

  test('writes nothing on a frame that changed nothing', () => {
    const env = environment()
    start()

    env.scroll(reaches(1700))
    env.frames()
    env.sprout.properties.clear()

    env.scroll(reaches(1700) + 5)
    env.frames()
    expect(env.sprout.properties.size).toBe(0)
  })

  // The stops move when the window does, and the reader who resized never
  // scrolled, so nothing else would have told the sprout to follow them.
  test('follows the stops when the window changes width', () => {
    const env = environment()
    start()

    env.scroll(reaches(1700))
    env.frames()
    env.stops[1].offsetLeft = 200
    env.stops[1].offsetWidth = 60

    env.window.innerWidth = 1100
    env.window.dispatch('resize')
    expect(env.marker()).toEqual({
      transform: 'translate3d(200px, 0, 0)',
      visible: true,
    })
    expect(env.plant()).toEqual({ transform: undefined, duration: undefined })
  })
})

describe('the installer copy control', () => {
  test('copies what the attribute carries', async () => {
    const written: string[] = []
    const env = environment({
      writeText: async (text: string) => {
        written.push(text)
      },
    })
    // The screen and the attribute are one value written twice. Parting them
    // here is what shows which of the two the script reads.
    env.command.textContent = 'read from the screen'
    start()
    env.button.dispatch('click')
    await settle()

    expect(written).toEqual([COMMAND])
  })

  test('says Copied, then offers again after 1600ms', async () => {
    const env = environment({ writeText: async () => {} })
    start()
    env.button.dispatch('click')
    await settle()
    expect(env.label.textContent).toBe('Copied')
    expect(env.status.textContent).toBe('Copied')
    // The transient word never renames the control; only Select does.
    expect(env.button.attributes.get('aria-label')).toBe('Copy')

    vi.advanceTimersByTime(1599)
    expect(env.label.textContent).toBe('Copied')
    vi.advanceTimersByTime(1)
    expect(env.label.textContent).toBe('Copy')
    expect(env.status.textContent).toBe('')
  })

  test('selects the command alone when the clipboard refuses', async () => {
    const env = environment({
      writeText: async () => {
        throw new Error('refused')
      },
    })
    start()
    env.button.dispatch('click')
    await settle()

    expect(env.label.textContent).toBe('Select')
    // Select is the word that settles and stays, so it becomes the name too:
    // a reader who repeats the word they see has to reach the control by it.
    expect(env.button.attributes.get('aria-label')).toBe('Select')
    expect(env.status.textContent).toBe('Copy failed')
    expect(env.range.node).toBe(env.command)
    expect(env.range.node).not.toBe(env.line)
    expect(env.selected).toEqual([env.range])
    // The old selection goes before the new one arrives.
    expect(env.cleared).toEqual([0])
  })

  test('selects where there is no clipboard at all', () => {
    const env = environment()
    start()
    env.button.dispatch('click')

    expect(env.label.textContent).toBe('Select')
    expect(env.range.node).toBe(env.command)
  })

  test('selects where the clipboard carries no writer', () => {
    const env = environment({})
    start()
    env.button.dispatch('click')

    expect(env.label.textContent).toBe('Select')
    expect(env.range.node).toBe(env.command)
  })

  test('gives a second press its own full window', async () => {
    const env = environment({ writeText: async () => {} })
    start()

    env.button.dispatch('click')
    await settle()
    vi.advanceTimersByTime(1000)
    expect(env.label.textContent).toBe('Copied')

    env.button.dispatch('click')
    await settle()
    // The first press's restore is gone with it, so the second word stands
    // for its own 1600ms and not the 600ms left of the first.
    vi.advanceTimersByTime(1599)
    expect(env.label.textContent).toBe('Copied')
    vi.advanceTimersByTime(1)
    expect(env.label.textContent).toBe('Copy')
  })

  test('leaves Select standing after a press that had copied', async () => {
    let refuse = false
    const env = environment({
      writeText: async () => {
        if (refuse) throw new Error('refused')
      },
    })
    start()

    env.button.dispatch('click')
    await settle()
    expect(env.label.textContent).toBe('Copied')

    refuse = true
    vi.advanceTimersByTime(800)
    env.button.dispatch('click')
    await settle()
    expect(env.label.textContent).toBe('Select')

    // The restore the first press left behind must not put Copy back over
    // an offer the reader still has to act on.
    vi.advanceTimersByTime(800)
    expect(env.label.textContent).toBe('Select')
    vi.advanceTimersByTime(1600)
    expect(env.label.textContent).toBe('Select')
  })

  test('leaves Select standing, because the selection stands too', async () => {
    const env = environment({
      writeText: async () => {
        throw new Error('refused')
      },
    })
    start()
    env.button.dispatch('click')
    await settle()

    vi.advanceTimersByTime(5000)
    expect(env.label.textContent).toBe('Select')
  })
})

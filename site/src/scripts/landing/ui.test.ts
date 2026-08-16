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
  readonly classes = new Set<string>()
  readonly dataset: Record<string, string | undefined> = {}
  readonly classList = {
    toggle: (name: string, force: boolean): void => {
      if (force) this.classes.add(name)
      else this.classes.delete(name)
    },
  }

  /* What the trail writes and reads. The attributes are the current stop's
   * announcement, the properties are where the light was put, and the box is
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

  removeAttribute(name: string): void {
    this.attributes.delete(name)
  }

  querySelectorAll(): FakeElement[] {
    return this.matched
  }

  getBoundingClientRect(): { top: number } {
    return { top: this.documentTop - (globalThis.window?.scrollY ?? 0) }
  }
}

const COMMAND = 'curl -fsSL https://niwa.rs | sh -s'

/** Let the clipboard's promise settle, which takes a microtask, not a timer. */
const settle = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function environment(clipboard?: { writeText?: (text: string) => Promise<void> }) {
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

  /* The trail: three stops in a nav, and the section each one names. The
   * offsets are a plausible row of words, and the tops are a page with the
   * garden above the first section. `install` has no stop pointing at it
   * from `sections` alone — the pairing is the `data-trail-stop` attribute,
   * exactly as it is on the page. */
  const trail = new FakeElement()
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
    ['[data-install-copy]', button],
    ['[data-install-label]', label],
    ['[data-install-status]', status],
    ['[data-command]', command],
  ])

  const selected: unknown[] = []
  const cleared: number[] = []
  const range = {
    node: undefined as unknown,
    selectNodeContents(node: unknown): void {
      this.node = node
    },
  }

  const frames: FrameRequestCallback[] = []
  const window = Object.assign(new Target(), {
    scrollY: 0,
    innerHeight: 900,
    innerWidth: 1440,
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
    stops: trail.matched,
    sections,
    button,
    label,
    status,
    command,
    line,
    range,
    selected,
    cleared,
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
    /** Where the light was put, and how wide it was made. */
    light(): { x: string | undefined; width: string | undefined } {
      return {
        x: trail.properties.get('--trail-x'),
        width: trail.properties.get('--trail-width'),
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
    expect(env.light().width).toBe('0px')
  })

  test('lights the stop the reader has reached', () => {
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

  test('lights one stop and no more', () => {
    const env = environment()
    start()

    env.scroll(reaches(5230))
    env.frames()

    expect(env.stops.filter((stop) => stop.attributes.has('aria-current'))).toHaveLength(1)
  })

  // The stop behind the reader keeps the light through the sections the trail
  // does not name, which is the whole stretch between the config and the last
  // word. A trail whose light goes out reads as broken.
  test('holds the last stop passed through the sections between', () => {
    const env = environment()
    start()

    env.scroll(reaches(1700) + 1500)
    env.frames()
    expect(env.current()).toBe('config')
  })

  /* The last section's top stops 24 pixels short of the reading line however
   * far the page is scrolled, because the page runs out first. A line that
   * did not move for that left the final stop lighting over the last two
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
  // stop before the last one is not handed the light early.
  test('does not slide the line while the page still has a viewport to give', () => {
    const env = environment()
    start()

    env.scroll(reaches(5230) - 900)
    env.frames()
    expect(env.current()).toBe('config')
  })

  test('goes dark again above the first section', () => {
    const env = environment()
    start()

    env.scroll(reaches(1700))
    env.frames()
    expect(env.current()).toBe('config')

    env.scroll(0)
    env.frames()
    expect(env.current()).toBeUndefined()
    expect(env.light().width).toBe('0px')
  })

  // The light carries eight pixels of air past each end of the word, which is
  // the fade the stylesheet lays over each end of the gradient.
  test('puts the light on the stop, with a pad at each end', () => {
    const env = environment()
    start()

    env.scroll(reaches(1700))
    env.frames()

    expect(env.light()).toEqual({ x: '87px', width: '61px' })
  })

  test('says where the reader is to someone who cannot see the light', () => {
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
    env.trail.properties.clear()

    env.scroll(reaches(1700) + 5)
    env.frames()
    expect(env.trail.properties.size).toBe(0)
  })

  // The stops move when the window does, and the reader who resized never
  // scrolled, so nothing else would have told the light to follow them.
  test('follows the stops when the window changes width', () => {
    const env = environment()
    start()

    env.scroll(reaches(1700))
    env.frames()
    env.stops[1].offsetLeft = 200
    env.stops[1].offsetWidth = 60

    env.window.innerWidth = 1100
    env.window.dispatch('resize')
    expect(env.light()).toEqual({ x: '192px', width: '76px' })
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

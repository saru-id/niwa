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

  // What the reader sees is a line with a prompt in it. The command is the
  // span inside that line, and the prompt is its sibling.
  const line = new FakeElement()
  line.textContent = `$ ${COMMAND}`
  const command = new FakeElement()
  command.textContent = COMMAND
  command.dataset.command = COMMAND
  command.parentElement = line

  const elements = new Map<string, FakeElement>([
    ['.site-header', bar],
    ['[data-install-copy]', button],
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
    querySelector(selector: string): FakeElement | null {
      return elements.get(selector) ?? null
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
    button,
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
    expect(env.button.textContent).toBe('Copied')

    vi.advanceTimersByTime(1599)
    expect(env.button.textContent).toBe('Copied')
    vi.advanceTimersByTime(1)
    expect(env.button.textContent).toBe('Copy')
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

    expect(env.button.textContent).toBe('Select')
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

    expect(env.button.textContent).toBe('Select')
    expect(env.range.node).toBe(env.command)
  })

  test('selects where the clipboard carries no writer', () => {
    const env = environment({})
    start()
    env.button.dispatch('click')

    expect(env.button.textContent).toBe('Select')
    expect(env.range.node).toBe(env.command)
  })

  test('gives a second press its own full window', async () => {
    const env = environment({ writeText: async () => {} })
    start()

    env.button.dispatch('click')
    await settle()
    vi.advanceTimersByTime(1000)
    expect(env.button.textContent).toBe('Copied')

    env.button.dispatch('click')
    await settle()
    // The first press's restore is gone with it, so the second word stands
    // for its own 1600ms and not the 600ms left of the first.
    vi.advanceTimersByTime(1599)
    expect(env.button.textContent).toBe('Copied')
    vi.advanceTimersByTime(1)
    expect(env.button.textContent).toBe('Copy')
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
    expect(env.button.textContent).toBe('Copied')

    refuse = true
    vi.advanceTimersByTime(800)
    env.button.dispatch('click')
    await settle()
    expect(env.button.textContent).toBe('Select')

    // The restore the first press left behind must not put Copy back over
    // an offer the reader still has to act on.
    vi.advanceTimersByTime(800)
    expect(env.button.textContent).toBe('Select')
    vi.advanceTimersByTime(1600)
    expect(env.button.textContent).toBe('Select')
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
    expect(env.button.textContent).toBe('Select')
  })
})

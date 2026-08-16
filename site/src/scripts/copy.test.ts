import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

/* The fence's copy control, heard rather than seen.
 *
 * A screen reader gets two things from the control: a name that says what
 * pressing it does, and a status region that says what the last press did.
 * The name is markup and holds still; everything the script writes lands in
 * the region and in the visible label, and the pair is what these tests
 * follow.
 *
 * `copy.ts` binds its listener to the document as it loads, so every test
 * builds a page, installs it, and loads the module into it.
 */

type Handler = (event: unknown) => void

// The script guards its event target with `instanceof`, so the double stands
// on two constructors of its own and installs them as the browser's.
class Element {}
class HTMLElement extends Element {}

/* One element, matched by the literal selectors the script asks for. */
class Fake extends HTMLElement {
  parent: Fake | null = null
  readonly children: Fake[] = []

  constructor(
    readonly selectors: readonly string[],
    public textContent: string | null = null,
  ) {
    super()
  }

  add(child: Fake): Fake {
    child.parent = this
    this.children.push(child)
    return child
  }

  closest(selector: string): Fake | null {
    let node: Fake | null = this
    while (node !== null && !node.selectors.includes(selector)) node = node.parent
    return node
  }

  querySelector(selector: string): Fake | null {
    for (const child of this.children) {
      if (child.selectors.includes(selector)) return child
      const found = child.querySelector(selector)
      if (found !== null) return found
    }
    return null
  }
}

const SNIPPET = 'niwa apply'

/** Let the clipboard's promise settle, which takes a microtask, not a timer. */
const settle = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function define(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}

/** The fence as `Markdown.tsx` renders it, with the script listening to it. */
async function page(clipboard?: { writeText?: (text: string) => Promise<void> }) {
  const block = new Fake(['[data-code-block]'])
  const controls = block.add(new Fake([]))
  const button = controls.add(new Fake(['[data-copy]']))
  const label = button.add(new Fake(['[data-copy-label]'], 'Copy'))
  // The region is a sibling of the button, never a child: inside it, its
  // words would be the button's name.
  const status = controls.add(new Fake(['[data-copy-status]'], ''))
  const code = block.add(new Fake([])).add(new Fake(['code'], SNIPPET))
  const loose = new Fake([])

  const clicks: Handler[] = []
  define('Element', Element)
  define('HTMLElement', HTMLElement)
  define('document', {
    addEventListener(type: string, handler: Handler): void {
      if (type === 'click') clicks.push(handler)
    },
  })
  define('navigator', { clipboard })

  vi.resetModules()
  await import('./copy')

  return {
    label,
    status,
    code,
    loose,
    click(from: Fake = label): void {
      for (const handler of clicks) handler({ target: from })
    },
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  for (const name of ['Element', 'HTMLElement', 'document', 'navigator']) {
    Reflect.deleteProperty(globalThis, name)
  }
})

describe('the fence copy control', () => {
  test('copies the code the fence holds', async () => {
    const written: string[] = []
    const env = await page({
      writeText: async (text: string) => {
        written.push(text)
      },
    })
    env.click()
    await settle()

    expect(written).toEqual([SNIPPET])
  })

  test('says Copied in both places, then offers again after 1500ms', async () => {
    const env = await page({ writeText: async () => {} })
    env.click()
    await settle()
    expect(env.label.textContent).toBe('Copied')
    expect(env.status.textContent).toBe('Copied')

    vi.advanceTimersByTime(1499)
    expect(env.label.textContent).toBe('Copied')
    expect(env.status.textContent).toBe('Copied')

    vi.advanceTimersByTime(1)
    expect(env.label.textContent).toBe('Copy')
    // The region goes empty rather than back to the offer: the offer is the
    // button's name, which the region does not repeat.
    expect(env.status.textContent).toBe('')
  })

  test('announces a second copy of the same word', async () => {
    const env = await page({ writeText: async () => {} })
    env.click()
    await settle()
    vi.advanceTimersByTime(1500)
    expect(env.status.textContent).toBe('')

    // Emptying is what makes this a change for the region to announce.
    env.click()
    await settle()
    expect(env.status.textContent).toBe('Copied')
  })

  test('says Copy failed when the write is refused', async () => {
    const env = await page({
      writeText: async () => {
        throw new Error('refused')
      },
    })
    env.click()
    await settle()

    expect(env.label.textContent).toBe('Copy failed')
    expect(env.status.textContent).toBe('Copy failed')

    vi.advanceTimersByTime(1500)
    expect(env.label.textContent).toBe('Copy')
    expect(env.status.textContent).toBe('')
  })

  test('says Copy failed where there is no clipboard at all', async () => {
    const env = await page()
    env.click()

    expect(env.label.textContent).toBe('Copy failed')
    expect(env.status.textContent).toBe('Copy failed')
  })

  test('answers a press anywhere on the control', async () => {
    const written: string[] = []
    const env = await page({
      writeText: async (text: string) => {
        written.push(text)
      },
    })
    // The label fills the button, but the padding around it is the button too.
    env.click(env.label.parent ?? env.label)
    await settle()

    expect(written).toEqual([SNIPPET])
  })

  test('leaves a press outside a fence alone', async () => {
    const written: string[] = []
    const env = await page({
      writeText: async (text: string) => {
        written.push(text)
      },
    })
    env.click(env.loose)
    await settle()

    expect(written).toEqual([])
    expect(env.status.textContent).toBe('')
  })
})

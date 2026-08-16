import { afterEach, expect, test, vi } from 'vitest'

/* Loading a module must cost nothing.
 *
 * The scene waits two seconds for a reason, and the wait is a fiction if the
 * module has already queried the document, built a canvas or armed an
 * observer on its way in. The instrument below records every touch of the
 * document, the window and the two observers, and the modules are loaded
 * under it.
 */

const touched: string[] = []
const built: string[] = []

function surface(name: string): unknown {
  return new Proxy(
    {},
    {
      get(_target, key) {
        touched.push(`${name}.${String(key)}`)
        return () => null
      },
    },
  )
}

function define(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}

class Watched {
  constructor(readonly name: string) {
    built.push(name)
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

afterEach(() => {
  for (const name of ['window', 'document', 'navigator', 'IntersectionObserver', 'ResizeObserver']) {
    Reflect.deleteProperty(globalThis, name)
  }
})

test('the landing modules touch nothing when they load', async () => {
  define('window', surface('window'))
  define('document', surface('document'))
  define('navigator', surface('navigator'))
  define(
    'IntersectionObserver',
    class extends Watched {
      constructor() {
        super('IntersectionObserver')
      }
    },
  )
  define(
    'ResizeObserver',
    class extends Watched {
      constructor() {
        super('ResizeObserver')
      }
    },
  )

  vi.resetModules()
  const scene = await import('./index')
  const ui = await import('./ui')

  expect(touched).toEqual([])
  expect(built).toEqual([])
  expect(typeof scene.start).toBe('function')
  expect(typeof ui.start).toBe('function')

  // The instrument is only worth trusting if it catches something, so the
  // document that stayed untouched through both loads records the first call.
  ui.start()
  expect(touched).toContain('document.querySelector')
})

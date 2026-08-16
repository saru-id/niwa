import { describe, expect, test } from 'vitest'
import worker from './index'

/* The Worker end to end, over a stand-in asset store.
 *
 * `recognize.test.ts` and `release.test.ts` cover the two decisions on their
 * own. What is left is the routing between them, and that is where the one
 * real defect lived: when `/release/*` was added to the Worker's routes, a
 * release name that did not match fell through to the apex's recognition and
 * answered a download request with the installer, under a 200.
 */

const SCRIPT = '#!/bin/sh\n# the installer\n'

function env() {
  return {
    ASSETS: {
      fetch: (request: Request) => {
        const { pathname } = new URL(request.url)
        if (pathname === '/install.sh') {
          // The headers the store puts on the real file: its own cache rule,
          // its entity tag, and the security set every path carries.
          return Promise.resolve(
            new Response(SCRIPT, {
              status: 200,
              headers: {
                'Cache-Control': 'public, max-age=300',
                'X-Content-Type-Options': 'nosniff',
                ETag: '"script-v1"',
              },
            }),
          )
        }
        if (pathname === '/') {
          return Promise.resolve(
            new Response(request.method === 'HEAD' ? null : '<!doctype html>', {
              status: 200,
              headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'X-Content-Type-Options': 'nosniff',
              },
            }),
          )
        }
        return Promise.resolve(new Response('not found', { status: 404 }))
      },
    },
  }
}

const CLI = { 'user-agent': 'curl/8.4.0' }
const BROWSER = { 'user-agent': 'Mozilla/5.0', accept: 'text/html' }

function get(path: string, headers: Record<string, string>, method = 'GET') {
  return worker.fetch(new Request(`https://niwa.rs${path}`, { headers, method }), env())
}

describe('the Worker', () => {
  test('gives the apex installer to a command line fetch', async () => {
    const response = await get('/', CLI)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/x-shellscript; charset=utf-8')
    expect(await response.text()).toBe(SCRIPT)
  })

  test('gives the apex page to a browser', async () => {
    const response = await get('/', BROWSER)
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
  })

  test('redirects a release to where the binaries live', async () => {
    const response = await get('/release/niwa-0.1.0-macos-arm64.tar.gz', CLI)
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(
      'https://github.com/saru-id/niwa/releases/download/v0.1.0/niwa-0.1.0-macos-arm64.tar.gz',
    )
  })

  // The defect this file exists for. A request for a tarball must never be
  // answered with a shell script, whoever is asking.
  test('never answers an unmatched release path with the installer', async () => {
    for (const path of [
      '/release/evil.tar.gz',
      '/release/niwa-0.1.0-linux-arm64.tar.gz',
      '/release/niwa-0.1.0-macos-riscv.tar.gz',
      '/release/',
    ]) {
      const response = await get(path, CLI)
      expect(response.headers.get('content-type'), path).not.toBe(
        'text/x-shellscript; charset=utf-8',
      )
      expect(await response.text(), path).not.toContain('#!/bin/sh')
    }
  })

  /* The apex is negotiated, so the apex is never stored. Both answers say
   * so, and both name the headers the choice read: a cache that stores
   * anyway still cannot hand one audience the other's body. */
  test('tells every cache to hold neither apex answer', async () => {
    for (const asking of [CLI, BROWSER]) {
      const response = await get('/', asking)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(response.headers.get('vary')).toBe('Accept, User-Agent')
    }
  })

  // A fetcher that sends no headers at all is a command line.
  test('gives the installer to a fetcher with no headers', async () => {
    const response = await get('/', {})
    expect(response.headers.get('content-type')).toBe('text/x-shellscript; charset=utf-8')
  })

  // The wrap replaces the cache rule and nothing else: the store's entity
  // tag and its security set reach the reader.
  test('carries the asset headers through the apex wrap', async () => {
    const script = await get('/', CLI)
    expect(script.headers.get('x-content-type-options')).toBe('nosniff')
    expect(script.headers.get('etag')).toBe('"script-v1"')
    expect(script.headers.get('cache-control')).toBe('no-store')

    const page = await get('/', BROWSER)
    expect(page.headers.get('x-content-type-options')).toBe('nosniff')
  })

  // The same choice, the same headers, and no body.
  test('answers a HEAD of the apex without a body', async () => {
    for (const asking of [CLI, BROWSER]) {
      const response = await get('/', asking, 'HEAD')
      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(response.headers.get('vary')).toBe('Accept, User-Agent')
      expect(await response.text()).toBe('')
    }
  })

  // Only a read has two representations to choose between. Anything else is
  // the asset store's to refuse, and it is never given the installer.
  test('never negotiates a write', async () => {
    for (const method of ['POST', 'PUT', 'DELETE']) {
      const response = await get('/', CLI, method)
      expect(response.headers.get('content-type'), method).not.toBe(
        'text/x-shellscript; charset=utf-8',
      )
    }
  })

  // A deploy that lost the installer still answers with apex cache rules:
  // the failure is negotiated too, and no cache may hold it for the other
  // audience.
  test('keeps even a missing installer uncacheable at the apex', async () => {
    const bare = {
      ASSETS: {
        fetch: () => Promise.resolve(new Response('not found', { status: 404 })),
      },
    }
    const response = await worker.fetch(
      new Request('https://niwa.rs/', { headers: CLI }),
      bare,
    )
    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('vary')).toBe('Accept, User-Agent')
    expect(response.headers.get('content-type')).not.toBe('text/x-shellscript; charset=utf-8')
  })

  // The redirect reads only the path, so it may be shared for its lifetime.
  test('lets a release redirect be cached', async () => {
    const response = await get('/release/niwa-0.1.0-macos-arm64.tar.gz', CLI)
    expect(response.headers.get('cache-control')).toBe('public, max-age=300')
    expect(response.headers.get('vary')).toBeNull()
  })

  // Same rule one path further out: /install.sh is a plain asset and the
  // Worker never rewrites it, so its own headers stand.
  test('leaves every other path to the asset store', async () => {
    const response = await get('/install.sh', CLI)
    expect(response.headers.get('content-type')).not.toBe('text/x-shellscript; charset=utf-8')
  })
})

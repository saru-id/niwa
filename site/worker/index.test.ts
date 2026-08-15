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
          return Promise.resolve(new Response(SCRIPT, { status: 200 }))
        }
        if (pathname === '/') {
          return Promise.resolve(
            new Response('<!doctype html>', {
              status: 200,
              headers: { 'Content-Type': 'text/html; charset=utf-8' },
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

function get(path: string, headers: Record<string, string>) {
  return worker.fetch(new Request(`https://niwa.rs${path}`, { headers }), env())
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

  // Same rule one path further out: /install.sh is a plain asset and the
  // Worker never rewrites it, so its own headers stand.
  test('leaves every other path to the asset store', async () => {
    const response = await get('/install.sh', CLI)
    expect(response.headers.get('content-type')).not.toBe('text/x-shellscript; charset=utf-8')
  })
})

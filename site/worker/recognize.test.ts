import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isCommandLineFetch } from './recognize'

const BROWSER_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
const BROWSER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'

describe('isCommandLineFetch', () => {
  it('recognizes curl', () => {
    expect(isCommandLineFetch('curl/8.7.1', '*/*')).toBe(true)
  })

  it('recognizes wget', () => {
    expect(isCommandLineFetch('Wget/1.24.5', '*/*')).toBe(true)
  })

  it('ignores the case of the user agent', () => {
    expect(isCommandLineFetch('CURL/8.7.1', '*/*')).toBe(true)
    expect(isCommandLineFetch('cUrL/8.7.1', BROWSER_ACCEPT)).toBe(true)
  })

  it('leaves a browser alone', () => {
    expect(isCommandLineFetch(BROWSER_AGENT, BROWSER_ACCEPT)).toBe(false)
  })

  it('treats a missing Accept header as a command line fetch', () => {
    // A browser always states what it accepts. Nothing else has to.
    expect(isCommandLineFetch(BROWSER_AGENT, null)).toBe(true)
    expect(isCommandLineFetch(undefined, undefined)).toBe(true)
  })

  it('treats an Accept header without text/html as a command line fetch', () => {
    expect(isCommandLineFetch('HTTPie/3.2.4', 'application/json, */*')).toBe(true)
  })
})

describe('wrangler.toml', () => {
  // The Worker decides for the apex and for the release downloads, and for
  // nothing else. /install.sh and every other path are static assets, so no
  // test of the recognition covers them: the configuration is what keeps
  // them out of the Worker.
  const config = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8')

  it('runs the Worker first for the apex and the releases, and nothing else', () => {
    expect(config).toContain('run_worker_first = ["/", "/release/*"]')
  })

  it('binds the asset store the Worker reads the installer from', () => {
    expect(config).toContain('binding = "ASSETS"')
  })
})

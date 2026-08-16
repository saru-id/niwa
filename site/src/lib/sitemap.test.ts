import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LANDING, NAV } from '../nav'
import { sitemap, sitemapUrls } from './sitemap'
import { canonicalUrl } from './urls'

// The link gate reads built HTML and never opens sitemap.xml, so this file is
// the sitemap's only check.
//
// Vitest does not load astro.config, so `import.meta.env.SITE` is unset under
// it and every canonical URL would be built against no origin. The origin the
// site is served from is set for each test instead.
beforeEach(() => {
  vi.stubEnv('SITE', 'https://niwa.rs')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('the sitemap inventory', () => {
  it('is the landing and every navigation entry, and nothing else', () => {
    const pages = [LANDING, ...NAV.flatMap((group) => group.entries)]
    const expected = new Set(pages.map((entry) => canonicalUrl(entry.path)))
    expect(new Set(sitemapUrls())).toEqual(expected)
  })

  it('names each page once', () => {
    const urls = sitemapUrls()
    expect(new Set(urls).size).toBe(urls.length)
  })

  it('gives every page an absolute address on this site', () => {
    for (const url of sitemapUrls()) {
      expect(url.startsWith('https://niwa.rs/'), url).toBe(true)
    }
  })

  it('addresses every page as the directory the build writes', () => {
    for (const url of sitemapUrls()) {
      expect(url.endsWith('/'), url).toBe(true)
    }
  })
})

describe('the sitemap document', () => {
  // The document is built inside each test: the origin it is built against is
  // only set once the stub above has run.

  it('is a urlset carrying one location per page', () => {
    const document = sitemap()
    expect(document).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    const locations = [...document.matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) => match[1])
    expect(locations).toEqual([...sitemapUrls()])
  })

  it('states nothing the site does not know', () => {
    const document = sitemap()
    expect(document).not.toContain('<priority')
    expect(document).not.toContain('<changefreq')
    expect(document).not.toContain('<lastmod')
  })

  // The locations land in XML without an escaper, which is safe exactly as
  // long as no address carries markup's one unencoded character.
  it('holds no address an XML document cannot carry raw', () => {
    for (const url of sitemapUrls()) {
      expect(url.includes('&'), url).toBe(false)
    }
  })
})

describe('robots.txt', () => {
  // The origin is said twice: the config declares it and robots.txt names the
  // sitemap with it. Two statements of one fact are checked against each other.
  it('names the sitemap at the configured origin', () => {
    const config = readFileSync(new URL('../../astro.config.ts', import.meta.url), 'utf8')
    const site = /site:\s*'([^']+)'/.exec(config)
    expect(site).not.toBeNull()
    const robots = readFileSync(new URL('../../public/robots.txt', import.meta.url), 'utf8')
    expect(robots).toContain(`Sitemap: ${site?.[1]}/sitemap.xml`)
  })
})

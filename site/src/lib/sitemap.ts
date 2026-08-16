/* The sitemap, built from the navigation.
 *
 * The inventory is `src/nav.ts`, the same module the sidebar renders from and
 * `/llms.txt` enumerates, so the sitemap cannot list a page the site does not
 * have or miss one it does.
 *
 * It lives here rather than beside the route because Astro's route walker
 * takes a `.ts` file under `src/pages/` without a leading underscore as an
 * endpoint, so a helper and its test placed there would each become a URL of
 * the site.
 */

import { LANDING, NAV } from '../nav'
import { canonicalUrl } from './urls'

/** Every page of the site, as the absolute URL the build serves it from. */
export function sitemapUrls(): readonly string[] {
  const pages = [LANDING, ...NAV.flatMap((group) => group.entries)]
  return pages.map((entry) => canonicalUrl(entry.path))
}

/**
 * The sitemap document.
 *
 * One location per page and nothing more. A priority, a change frequency, or
 * a modification date would each be a number the site does not know.
 */
export function sitemap(): string {
  const entries = sitemapUrls().map((url) => `  <url><loc>${url}</loc></url>`)
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    '</urlset>',
    '',
  ].join('\n')
}

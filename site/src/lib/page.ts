/* Where a content file sits on the site.
 *
 * `src/nav.ts` is the inventory. A markdown file whose path is not in it is
 * not a page: nothing links to it, the sidebar does not carry it, and
 * `/llms.txt` does not list it. The build stops instead of shipping it.
 */

import { NAV } from '../nav'

/* The probe is scaffolding, not a page. It proves this template on one file
 * and wears its own label. It is the only file the inventory lets through,
 * and it goes when the documentation replaces it: delete this constant, the
 * branch below, and `src/content/docs/probe.md` together.
 */
const PROBE = 'probe'

/** The area a page belongs to: the label of its group in the sidebar. */
export function areaOf(id: string, file: string): string {
  if (id === PROBE) return 'Probe'

  const path = `/${id}`
  for (const group of NAV) {
    if (group.entries.some((entry) => entry.path === path)) {
      return group.label
    }
  }

  throw new Error(
    `Placing the page for ${file}. Its path ${path} is not in src/nav.ts, ` +
      'so the page has no area, no sidebar entry, and no line in /llms.txt. ' +
      'Add the page to NAV, or name the file after a path NAV already ' +
      'carries. The site did not build.',
  )
}

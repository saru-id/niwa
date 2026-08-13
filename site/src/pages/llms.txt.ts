/* The documentation index, for a reader that is a program.
 *
 * Every page, with the one line that says what it is for. It is generated
 * from `src/nav.ts`, the same module the sidebar renders from, so the index
 * cannot list a page the site does not have or miss one it does.
 */

import type { APIRoute } from 'astro'
import { LANDING, NAV, type NavEntry } from '../nav'

/** The site, in one line. The footer names the version; this names the site. */
const HEADER = 'niwa.rs — the documentation for niwa, a configuration tool for macOS.'

function line(entry: NavEntry): string {
  return `- ${entry.path} — ${entry.title} — ${entry.job}`
}

/** The index's whole text. */
export function index(): string {
  const groups = NAV.map(
    (group) => `${group.label}\n${group.entries.map(line).join('\n')}`,
  )
  return [HEADER, line(LANDING), ...groups].join('\n\n') + '\n'
}

export const GET: APIRoute = () =>
  new Response(index(), {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })

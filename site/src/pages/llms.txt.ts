/* The documentation index, for a reader that is a program.
 *
 * The llms.txt form: a heading, the site in one line, then one markdown link
 * per page carrying the one line that says what the page is for. A section
 * heading opens each sidebar group. It is generated from `src/nav.ts`, the
 * same module the sidebar renders from, so the index cannot list a page the
 * site does not have or miss one it does. Every link is absolute, because a
 * reader that fetched this file may hold no base to resolve against.
 */

import type { APIRoute } from 'astro'
import { canonicalUrl } from '../lib/urls'
import { LANDING, NAV, type NavEntry } from '../nav'

// The sentence the landing's meta description carries. The two say the same
// thing on purpose: this file is the landing for machine readers.
const DESCRIPTION = 'niwa is a configuration tool for macOS.'

// One page is one line, so a reader can split the file on newlines and keep
// every page whole. Nothing here wraps.
function link(entry: NavEntry): string {
  return `- [${entry.title}](${canonicalUrl(entry.path)}): ${literal(entry.job)}`
}

// A job string is plain text. One of them names a path with angle brackets,
// which markdown reads as a raw tag and drops; the escape keeps the
// characters on the page.
function literal(text: string): string {
  return text.replace(/[<>]/g, (bracket) => `\\${bracket}`)
}

/** The index's whole text. */
export function index(): string {
  const groups = NAV.map(
    (group) => `## ${group.label}\n\n${group.entries.map(link).join('\n')}`,
  )
  return ['# niwa', `> ${DESCRIPTION}`, link(LANDING), ...groups].join('\n\n') + '\n'
}

export const GET: APIRoute = () =>
  new Response(index(), {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })

/* Links to other pages, built from the nav.
 *
 * The generated pages end where the nav says a page lives, and they name
 * it with the nav's own title and job. Nothing about a destination is
 * written twice: rename a page in `nav.ts` and every reference page that
 * points at it follows.
 */

import { NAV } from '../nav'

/** What `NextLinks` renders: where to go, and why. */
export interface PageLink {
  readonly href: string
  readonly label: string
  readonly why: string
}

const PAGES = new Map(NAV.flatMap((group) => group.entries).map((entry) => [entry.path, entry]))

/**
 * A link to a page the nav declares. An unknown path is a mistake in the
 * data, not a missing page, so it stops the build.
 */
export function pageLink(path: string, why?: string): PageLink {
  const entry = PAGES.get(path)
  if (!entry) {
    throw new Error(
      `Linking to ${path}. The nav declares no such page, so the label and ` +
        'the job for it do not exist. Fix the path, or add the page to ' +
        'src/nav.ts. The site did not build.',
    )
  }
  return { href: entry.path, label: entry.title, why: why ?? clause(entry.job) }
}

/**
 * A job written as a sentence, read as a clause after a dash. The first
 * letter drops its case only when the word is an ordinary one; an
 * identifier keeps the shape it is spelled with.
 */
function clause(job: string): string {
  const second = job.charAt(1)
  return second === second.toLowerCase() ? job.charAt(0).toLowerCase() + job.slice(1) : job
}

import { parseMarkdown } from '@tanstack/markdown'
import { collectMarkdownHeadings } from '@tanstack/markdown/extensions/headings'

export type Heading = {
  readonly depth: 2 | 3
  readonly id: string
  readonly text: string
}

/**
 * The headings a table of contents links to, in document order.
 *
 * Two levels only: an h2 names a section and an h3 names a step inside it.
 * Anything deeper is detail the rail would not survive.
 *
 * The ids come from the same `headingIds` pass the renderer runs, so the
 * links and the anchors agree. `Markdown.tsx` must keep that flag set.
 */
export function collectHeadings(source: string): Array<Heading> {
  const document = parseMarkdown(source, { headingIds: true })

  return collectMarkdownHeadings(document)
    .filter((heading) => heading.level === 2 || heading.level === 3)
    .map((heading) => ({
      depth: heading.level as 2 | 3,
      id: heading.id,
      text: heading.text,
    }))
}

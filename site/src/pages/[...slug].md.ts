/* The markdown twin of every page.
 *
 * One page, two representations, one source: this serves the file the page is
 * rendered from, with its frontmatter replaced by the title as an h1. Each
 * page links here once, in plain text. There is no dropdown and no button; a
 * URL already is the feature.
 */

import type { APIRoute } from 'astro'
import { getCollection } from 'astro:content'

export async function getStaticPaths() {
  const docs = await getCollection('docs')
  return docs.map((entry) => ({
    params: { slug: entry.id },
    props: { markdown: `# ${entry.data.title}\n\n${(entry.body ?? '').trim()}\n` },
  }))
}

export const GET: APIRoute<{ markdown: string }> = ({ props }) =>
  new Response(props.markdown, {
    headers: { 'content-type': 'text/markdown; charset=utf-8' },
  })

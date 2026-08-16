/* The page inventory, for a reader that is a crawler.
 *
 * The document is built in `src/lib/sitemap.ts`, next to its test.
 */

import type { APIRoute } from 'astro'
import { sitemap } from '../lib/sitemap'

export const GET: APIRoute = () =>
  new Response(sitemap(), {
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  })

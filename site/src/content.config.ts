import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'
import { z } from 'astro/zod'

// The docs are markdown on disk. The loader hands back the raw body, which is
// what the rendering pipeline reads; Astro's own renderer is never called.
//
// A file's path is its page's path: `concepts/model.md` is `/concepts/model`.
// The area a page belongs to is not declared here, because `src/nav.ts`
// already knows it. One inventory, read twice: the sidebar and this template.
const docs = defineCollection({
  loader: glob({ base: './src/content/docs', pattern: '**/*.md' }),
  schema: z.object({
    title: z.string(),
    /** The deck under the title, and the page's meta description. */
    description: z.string(),
    /* One to three links, written by hand, each with the clause that says
     * why to follow it. There is no mechanical next page: the count is the
     * brief's, and a page with nothing to send the reader to omits the key. */
    next: z
      .array(
        z.object({
          href: z.string(),
          label: z.string(),
          why: z.string(),
        }),
      )
      .min(1)
      .max(3)
      .optional(),
  }),
})

export const collections = { docs }

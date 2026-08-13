import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'
import { z } from 'astro/zod'

// The docs are markdown on disk. The loader hands back the raw body, which is
// what the rendering pipeline reads; Astro's own renderer is never called.
const docs = defineCollection({
  loader: glob({ base: './src/content/docs', pattern: '**/*.md' }),
  schema: z.object({
    title: z.string(),
  }),
})

export const collections = { docs }

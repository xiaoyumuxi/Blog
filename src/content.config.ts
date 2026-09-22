import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { isValidCoverSource } from './lib/post-cover';
const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(), description: z.string(), date: z.coerce.date(),
    tags: z.array(z.string()).default([]), draft: z.boolean().default(false),
    featured: z.boolean().default(false), sample: z.boolean().default(false),
    art: z.enum(['orbit','code','files']).default('orbit'),
    // Optional custom image. Without it, a title-based cover is generated locally.
    cover: z.string().trim().refine(isValidCoverSource, 'Use a public image path or an HTTP(S) image URL.').optional(),
    coverAlt: z.string().trim().optional(),
    series: z.object({
      name: z.string(),
      slug: z.string(),
      order: z.number().int().positive().optional()
    }).optional(),
    source: z.object({
      platform: z.string(),
      url: z.string().url()
    }).optional()
  })
});
export const collections = { blog };

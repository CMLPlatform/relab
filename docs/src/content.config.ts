import { defineCollection } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import { z } from 'astro/zod';

const docs = defineCollection({
  loader: docsLoader(),
  schema: docsSchema({
    extend: z.object({
      owner: z.string().min(1),
      status: z.enum(['draft', 'reviewed', 'canonical']),
      lastReviewed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  }),
});

export const collections = { docs };

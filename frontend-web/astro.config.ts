import { env as processEnv } from 'node:process';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

import { readSiteUrl } from './src/config/public.ts';

const defaultSiteUrl = 'https://cml-relab.org';

export default defineConfig({
  site: readSiteUrl(processEnv, defaultSiteUrl),
  integrations: [sitemap()],
});

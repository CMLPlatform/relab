import { env as processEnv } from 'node:process';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

import { readSiteUrl } from './src/config/public.ts';

const defaultSiteUrl = 'https://cml-relab.org';

export default defineConfig({
  devToolbar: {
    enabled: false,
  },
  site: readSiteUrl(processEnv, defaultSiteUrl),
  integrations: [sitemap()],
  vite: {
    build: {
      // Never inline scripts: the Caddy CSP is script-src 'self' (no
      // 'unsafe-inline'), so inlined scripts would be blocked in production.
      assetsInlineLimit: 0,
    },
  },
});

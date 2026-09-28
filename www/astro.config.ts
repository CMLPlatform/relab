import { env as processEnv } from 'node:process';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

import { readSiteUrl } from './src/config/public.ts';
import { securityHeaders } from './src/integrations/security-headers.ts';

const defaultSiteUrl = 'https://cml-relab.org';

export default defineConfig({
  devToolbar: {
    enabled: false,
  },
  site: readSiteUrl(processEnv, defaultSiteUrl),
  integrations: [sitemap(), securityHeaders(processEnv.PUBLIC_API_URL)],
  vite: {
    build: {
      // Never inline scripts: the CSP in src/integrations/security-headers.ts is
      // script-src 'self' (no 'unsafe-inline'), so inlined scripts would be blocked.
      assetsInlineLimit: 0,
    },
  },
});

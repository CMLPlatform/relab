import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

const siteByMode = {
  dev: 'http://localhost:8081',
  prod: 'https://cml-relab.org',
  staging: 'https://web-test.cml-relab.org',
  test: 'http://localhost:8081',
};

export default defineConfig(({ mode }) => ({
  site: process.env.SITE_URL ?? process.env.PUBLIC_SITE_URL ?? siteByMode[mode] ?? siteByMode.prod,
  integrations: [sitemap()],
}));

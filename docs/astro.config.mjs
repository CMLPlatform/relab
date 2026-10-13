import process from 'node:process';
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';
import { securityHeaders } from './src/integrations/security-headers.ts';

const MODE_SITES = {
  dev: 'http://127.0.0.1:8012',
  prod: 'https://docs.r9lab.io',
  staging: 'https://docs-test.r9lab.io',
  test: 'http://127.0.0.1:18012',
};
const MODE_FLAG = '--mode';
const CUSTOM_CSS = [
  './src/styles/brand.css',
  './src/styles/tokens.generated.css',
  './src/styles/base.css',
  './src/styles/components.css',
];
const HEAD_LINKS = [
  {
    tag: 'link',
    attrs: {
      rel: 'apple-touch-icon',
      href: '/images/apple-touch-icon.png',
      sizes: '180x180',
    },
  },
  {
    tag: 'link',
    attrs: {
      rel: 'preload',
      href: '/fonts/ibm-plex-sans-latin.woff2',
      as: 'font',
      type: 'font/woff2',
      crossorigin: true,
    },
  },
];
const SIDEBAR = [
  { label: 'Overview', slug: '' },
  {
    label: 'Guides',
    items: [
      { label: 'Guides overview', slug: 'user-guides' },
      { label: 'Getting started', slug: 'user-guides/getting-started' },
      { label: 'Data collection', slug: 'user-guides/data-collection' },
      { label: 'Glossary', slug: 'user-guides/glossary' },
      { label: 'Hardware', slug: 'user-guides/hardware' },
      { label: 'RPi camera setup', slug: 'user-guides/r9cam' },
      { label: 'Using the API', slug: 'user-guides/api' },
    ],
  },
  {
    label: 'Architecture',
    items: [
      { label: 'Architecture overview', slug: 'architecture' },
      { label: 'System design', slug: 'architecture/system-design' },
      { label: 'App navigation flow', slug: 'architecture/app-flow' },
      { label: 'Data model', slug: 'architecture/datamodel' },
      { label: 'API structure', slug: 'architecture/api' },
      { label: 'API reference', slug: 'api-reference' },
      { label: 'Authentication', slug: 'architecture/auth' },
      { label: 'RPi camera plugin', slug: 'architecture/r9cam' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Prerequisites', slug: 'operations/prerequisites' },
      { label: 'Install', slug: 'operations/install' },
      { label: 'Configure', slug: 'operations/configure' },
      { label: 'Deploy', slug: 'operations/deploy' },
      { label: 'Upgrade and backup', slug: 'operations/upgrade-backup' },
      { label: 'Deployment and operations', slug: 'operations/deployment' },
      { label: 'Security and hardening', slug: 'operations/security' },
    ],
  },
  {
    label: 'Project',
    items: [
      { label: 'Project context', slug: 'project' },
      { label: 'The 9R framework', slug: 'project/9r-framework' },
      { label: 'Use cases', slug: 'project/use-cases' },
      { label: 'Roadmap', slug: 'project/roadmap' },
      { label: 'Dataset', slug: 'project/dataset' },
      { label: 'Dataset codebook', slug: 'project/codebook' },
      { label: 'Licensing', slug: 'project/licensing' },
    ],
  },
];
const STARLIGHT_OPTIONS = {
  title: 'R9lab docs',
  description: 'Technical documentation for the R9lab research platform.',
  favicon: '/images/favicon.svg',
  titleDelimiter: '·',
  lastUpdated: true,
  pagefind: true,
  social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/CMLPlatform/r9lab' }],
  editLink: {
    baseUrl: 'https://github.com/CMLPlatform/r9lab/edit/main/docs/',
  },
  customCss: CUSTOM_CSS,
  head: HEAD_LINKS,
  sidebar: SIDEBAR,
  components: {
    Head: './src/components/Head.astro',
    SiteTitle: './src/components/SiteTitle.astro',
    SocialIcons: './src/components/SocialIcons.astro',
  },
};
const modeFlagIndex = process.argv.indexOf(MODE_FLAG);
let buildMode = 'prod';
if (modeFlagIndex >= 0) {
  buildMode = process.argv[modeFlagIndex + 1];
}
const site = process.env.PUBLIC_DOCS_URL?.trim() || MODE_SITES[buildMode] || MODE_SITES.prod;

export default defineConfig({
  site,
  // Pages renamed with the camera plugin keep their old links working.
  redirects: {
    '/user-guides/rpi-cam': '/user-guides/r9cam/',
    '/architecture/rpi-cam': '/architecture/r9cam/',
    '/api/rpi-cam': '/api/r9cam/',
  },
  vite: {
    server: {
      watch: {
        ignored: [
          '**/.astro/**',
          '**/dist/**',
          '**/node_modules/**',
          '**/playwright-report/**',
          '**/test-results/**',
        ],
      },
    },
    build: {
      // Scalar API reference (~2.8M) and Mermaid ship large minified chunks, each
      // isolated to its own lazy route; nothing to code-split, so suppress the warning.
      chunkSizeWarningLimit: 3000,
    },
  },
  integrations: [starlight(STARLIGHT_OPTIONS), securityHeaders(process.env.PUBLIC_BACKEND_API_URL)],
});

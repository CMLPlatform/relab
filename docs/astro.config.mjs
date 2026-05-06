import process from 'node:process';
import mdx from '@astrojs/mdx';
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

const MODE_SITES = {
  dev: 'http://127.0.0.1:8000',
  prod: 'https://docs.cml-relab.org',
  staging: 'https://docs-test.cml-relab.org',
  test: 'http://127.0.0.1:4300',
};
const MODE_FLAG = '--mode';
const CUSTOM_CSS = [
  './src/styles/tokens.css',
  './src/styles/base.css',
  './src/styles/components.css',
];
const HEAD_LINKS = [
  {
    tag: 'link',
    attrs: {
      rel: 'preload',
      href: '/fonts/space-grotesk-latin.woff2',
      as: 'font',
      type: 'font/woff2',
      crossorigin: true,
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
      { label: 'Getting started', slug: 'user-guides/getting-started' },
      { label: 'Data collection', slug: 'user-guides/data-collection' },
      { label: 'Hardware', slug: 'user-guides/hardware' },
      { label: 'RPI camera', slug: 'user-guides/rpi-cam' },
      { label: 'API', slug: 'user-guides/api' },
    ],
  },
  {
    label: 'Architecture',
    items: [
      { label: 'System design', slug: 'architecture/system-design' },
      { label: 'Data model', slug: 'architecture/datamodel' },
      { label: 'API structure', slug: 'architecture/api' },
      { label: 'Authentication', slug: 'architecture/auth' },
      { label: 'RPI camera plugin', slug: 'architecture/rpi-cam' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Install and self-host', slug: 'operations/install' },
      { label: 'Deployment', slug: 'operations/deployment' },
    ],
  },
  {
    label: 'Project',
    items: [
      { label: 'Use cases', slug: 'project/use-cases' },
      { label: 'Roadmap', slug: 'project/roadmap' },
      { label: 'Dataset', slug: 'project/dataset' },
    ],
  },
];
const STARLIGHT_OPTIONS = {
  title: 'RELab docs',
  description: 'Technical documentation for the Reverse Engineering Lab research platform.',
  logo: {
    src: './public/images/logo.png',
    alt: 'Reverse Engineering Lab logo',
  },
  favicon: '/images/favicon.ico',
  titleDelimiter: '·',
  lastUpdated: true,
  pagefind: true,
  social: [
    { icon: 'external', label: 'Open RELab app', href: 'https://app.cml-relab.org' },
    { icon: 'github', label: 'GitHub', href: 'https://github.com/CMLPlatform/relab' },
  ],
  editLink: {
    baseUrl: 'https://github.com/CMLPlatform/relab/edit/main/docs/',
  },
  customCss: CUSTOM_CSS,
  head: HEAD_LINKS,
  sidebar: SIDEBAR,
  components: {
    Head: './src/components/Head.astro',
  },
};
const modeFlagIndex = process.argv.indexOf(MODE_FLAG);
const buildMode = modeFlagIndex >= 0 ? process.argv[modeFlagIndex + 1] : 'prod';
const site = process.env.PUBLIC_DOCS_URL?.trim() || MODE_SITES[buildMode] || MODE_SITES.prod;

export default defineConfig({
  site,
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
      // Mermaid is lazy-loaded and ships a large minified chunk; suppress the warning for it.
      chunkSizeWarningLimit: 1500,
    },
  },
  integrations: [starlight(STARLIGHT_OPTIONS), mdx()],
});

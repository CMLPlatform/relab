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
  {
    label: 'Start Here',
    collapsed: true,
    items: [
      { label: 'Overview', slug: '' },
      { label: 'Guides', slug: 'user-guides' },
      { label: 'Project', slug: 'project' },
    ],
  },
  {
    label: 'Guides',
    collapsed: true,
    items: [
      { label: 'Getting Started', slug: 'user-guides/getting-started' },
      { label: 'Data Collection', slug: 'user-guides/data-collection' },
      { label: 'Hardware', slug: 'user-guides/hardware' },
      { label: 'RPI Camera', slug: 'user-guides/rpi-cam' },
      { label: 'API Interaction', slug: 'user-guides/api' },
    ],
  },
  {
    label: 'Reference',
    collapsed: true,
    items: [
      { label: 'Architecture Overview', slug: 'architecture' },
      { label: 'API Structure', slug: 'architecture/api' },
      { label: 'Authentication', slug: 'architecture/auth' },
      { label: 'Data Model', slug: 'architecture/datamodel' },
      { label: 'Deployment', slug: 'architecture/deployment' },
      { label: 'Engineering Configuration', slug: 'architecture/engineering-config' },
      { label: 'Engineering Operations', slug: 'architecture/engineering-ops' },
    ],
  },
  {
    label: 'Explanation',
    collapsed: true,
    items: [
      { label: 'System Design', slug: 'architecture/system-design' },
      { label: 'C4 Diagrams', slug: 'architecture/c4-diagrams' },
      { label: 'RPI Camera Plugin', slug: 'architecture/rpi-cam' },
    ],
  },
  {
    label: 'Project',
    collapsed: true,
    items: [
      { label: 'Overview', slug: 'project' },
      { label: 'Use Cases', slug: 'project/use-cases' },
      { label: 'Roadmap', slug: 'project/roadmap' },
      { label: 'Dataset', slug: 'project/dataset' },
    ],
  },
];
const STARLIGHT_OPTIONS = {
  title: 'Reverse Engineering Lab',
  description: 'Technical documentation for the Reverse Engineering Lab research platform.',
  logo: {
    src: './public/images/logo.png',
    alt: 'Reverse Engineering Lab logo',
  },
  favicon: '/images/favicon.ico',
  titleDelimiter: '·',
  lastUpdated: true,
  pagefind: true,
  social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/CMLPlatform/relab' }],
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
const site = MODE_SITES[buildMode] ?? MODE_SITES.prod;

export default defineConfig({
  site,
  vite: {
    build: {
      // Mermaid is lazy-loaded and currently ships a minified chunk just over Vite's default warning threshold.
      chunkSizeWarningLimit: 650,
    },
  },
  redirects: {
    '/guides': '/user-guides/',
    '/reference': '/architecture/',
    '/explanation': '/architecture/system-design/',
  },
  integrations: [starlight(STARLIGHT_OPTIONS), mdx()],
});

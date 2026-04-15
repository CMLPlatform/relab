import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import starlight from '@astrojs/starlight';

const buildMode = process.env.BUILD_MODE ?? process.env.MODE ?? 'prod';
const site =
  process.env.PUBLIC_SITE_URL ??
  (buildMode === 'staging' ? 'https://docs-test.cml-relab.org' : 'https://docs.cml-relab.org');

export default defineConfig({
  site,
  redirects: {
    '/guides': '/user-guides/',
    '/reference': '/architecture/',
    '/explanation': '/architecture/system-design/',
  },
  integrations: [
    starlight({
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
      customCss: [
        './src/styles/tokens.css',
        './src/styles/base.css',
        './src/styles/components.css',
      ],
      head: [
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
      ],
      sidebar: [
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
      ],
      components: {
        Head: './src/components/Head.astro',
      },
    }),
    mdx(),
  ],
});

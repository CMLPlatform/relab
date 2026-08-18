import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';

import SiteFooter from './SiteFooter.astro';

const PROPS = {
  contactEmail: 'team@relab.test',
  currentYear: 2031,
  docsUrl: 'https://docs.example.com',
  githubUrl: 'https://github.test',
  linkedInUrl: 'https://linkedin.test',
  youtubeUrl: 'https://youtube.test',
};

const render = async () =>
  (await AstroContainer.create()).renderToString(SiteFooter, { props: PROPS });

describe('SiteFooter', () => {
  it('renders the year, contact mailto, social links, and nested theme control', async () => {
    const html = await render();

    expect(html).toContain('2031');
    expect(html).toContain('href="mailto:team@relab.test"');
    expect(html).toContain('href="https://github.test"');
    expect(html).toContain('href="https://linkedin.test"');
    expect(html).toContain('href="https://youtube.test"');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/accessibility"');
    expect(html).toContain('aria-label="GitHub (opens in new tab)"');
    // The footer nests ThemeControl, so its markup renders too.
    expect(html).toContain('data-theme-control');
  });

  it('carries no wordmark: the header holds the mark on every page', async () => {
    const html = await render();
    // A third instance of the mark, under a sticky header that already shows
    // one, is decoration; the copyright line names the institution instead.
    expect(html).not.toContain('wordmark');
    expect(html).not.toContain('aria-label="Relab home"');
  });

  it('states the institution, the authors, and the funding', async () => {
    const html = await render();
    expect(html).toContain('Institute of Environmental Sciences (CML), Leiden University');
    expect(html).toContain('Simon van Lierde');
    expect(html).toContain('Franco Donati');
    expect(html).toContain('Sectorplan Gelden');
  });

  it('gives a citable DOI, resolved through doi.org', async () => {
    const html = await render();
    expect(html).toContain('https://doi.org/10.5281/zenodo.16637742');
    expect(html).toContain('doi:10.5281/zenodo.16637742');
  });

  it('licenses the software and links the docs for the dataset terms', async () => {
    const html = await render();
    expect(html).toContain('AGPL-3.0-or-later');
    expect(html).toContain('https://docs.example.com/project/dataset/');
  });

  it('never claims a dataset release that does not exist yet', async () => {
    const html = await render();
    // CC BY 4.0 is planned for curated releases; saying "the data is CC BY"
    // would promise terms nothing has been published under.
    expect(html).toContain('planned under CC BY 4.0');
    expect(html).toContain('no release has been published yet');
    // Guards the "planned" hedge itself: any copy that drops it and states the
    // licence flat ("licensed/published/available under CC BY 4.0") fails here.
    expect(html).not.toMatch(/(licensed|published|available) under CC BY/);
  });

  it('warns on every link that leaves the site', async () => {
    const html = await render();
    // Three social marks plus the DOI, licence and dataset links.
    expect(html.match(/\(opens in new tab\)/g)).toHaveLength(6);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadLandingData, parseTeardown } from './landing.ts';

const RAW = {
  id: 47,
  name: 'Dell XPS 13',
  brand: 'Dell',
  weight_g: 1190,
  components: [
    { name: 'Battery pack', weight_g: 212 },
    { name: 'Mainboard', weight_g: 98 },
  ],
  images: [
    { image_url: '/media/a.jpg', thumbnail_url: '/media/a-thumb.jpg', filename: 'a.jpg' },
    { image_url: '/media/b.jpg', thumbnail_url: null, filename: 'b.jpg' },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('parseTeardown', () => {
  it('maps the API payload to camelCase', () => {
    const t = parseTeardown(RAW);
    expect(t?.id).toBe(47);
    expect(t?.name).toBe('Dell XPS 13');
    expect(t?.weightG).toBe(1190);
    expect(t?.parts[0]).toEqual({
      name: 'Battery pack',
      weightG: 212,
      share: 0.684,
      photo: null,
    });
  });

  it('computes each part share of the summed recorded mass, to 3 decimals', () => {
    const t = parseTeardown(RAW);
    // 212 + 98 = 310 recorded grams in total.
    expect(t?.parts.map((p) => p.share)).toEqual([0.684, 0.316]);
  });

  it('gives a null share to unweighed parts and to all parts when nothing is weighed', () => {
    const weighed = parseTeardown({
      name: 'Mouse',
      components: [
        { name: 'Shell', weight_g: 40 },
        { name: 'Cable', weight_g: null },
      ],
    });
    expect(weighed?.parts.map((p) => p.share)).toEqual([1, null]);

    const unweighed = parseTeardown({
      name: 'Mouse',
      components: [{ name: 'Shell', weight_g: null }],
    });
    expect(unweighed?.parts[0].share).toBeNull();
  });

  it('reads the product type name and omits it when absent or blank', () => {
    expect(parseTeardown({ ...RAW, product_type: { name: 'Laptop' } })?.productType).toBe('Laptop');
    expect(parseTeardown(RAW)?.productType).toBeUndefined();
    expect(parseTeardown({ ...RAW, product_type: { name: '  ' } })?.productType).toBeUndefined();
    expect(parseTeardown({ ...RAW, product_type: null })?.productType).toBeUndefined();
  });

  it('takes parts and one child level from the component tree when given', () => {
    const tree = [
      {
        name: 'Display assembly',
        weight_g: 184,
        components: [{ name: 'LCD panel', weight_g: 121 }, { name: '', weight_g: 9 }, 'not-a-node'],
      },
      { name: 'Cooling fan', weight_g: 24, components: [] },
    ];
    const t = parseTeardown(RAW, tree);
    expect(t?.parts).toEqual([
      {
        name: 'Display assembly',
        weightG: 184,
        share: 0.885,
        photo: null,
        children: [{ name: 'LCD panel', weightG: 121, photo: null }],
      },
      { name: 'Cooling fan', weightG: 24, share: 0.115, photo: null },
    ]);
  });

  it('falls back to the flat component list for an unusable tree', () => {
    for (const tree of [null, 'nope', [], [{ weight_g: 5 }]]) {
      expect(parseTeardown(RAW, tree)?.parts.map((p) => p.name)).toEqual([
        'Battery pack',
        'Mainboard',
      ]);
    }
  });

  it('prefers the thumbnail, falls back to the full image, and resolves both against the API', () => {
    vi.stubEnv('PUBLIC_API_URL', 'http://api.test');
    const t = parseTeardown(RAW);
    expect(t?.photos[0].url).toBe('http://api.test/media/a-thumb.jpg');
    expect(t?.photos[1].url).toBe('http://api.test/media/b.jpg');
  });

  it('resolves the root-relative upload paths the API returns', () => {
    vi.stubEnv('PUBLIC_API_URL', 'http://api.test');
    const t = parseTeardown({ ...RAW, images: [{ image_url: '/uploads/images/a.jpg' }] });
    expect(t?.photos[0].url).toBe('http://api.test/uploads/images/a.jpg');
  });

  it('passes absolute http(s) image URLs through unchanged', () => {
    vi.stubEnv('PUBLIC_API_URL', 'http://api.test');
    const t = parseTeardown({ ...RAW, images: [{ image_url: 'https://cdn.test/a.jpg' }] });
    expect(t?.photos[0].url).toBe('https://cdn.test/a.jpg');
  });

  it('drops photos with a protocol-relative or non-http URL', () => {
    vi.stubEnv('PUBLIC_API_URL', 'http://api.test');
    for (const image_url of ['//evil.test/a.jpg', '/\\evil.test/a.jpg', 'javascript:alert(1)']) {
      expect(parseTeardown({ ...RAW, images: [{ image_url }] })?.photos).toEqual([]);
    }
  });

  it('gives every photo descriptive alt text naming the product', () => {
    const t = parseTeardown(RAW);
    expect(t?.photos[0].alt).toContain('Dell XPS 13');
  });

  it('returns null for a payload without a usable name', () => {
    expect(parseTeardown({ id: 1, components: [] })).toBeNull();
    expect(parseTeardown(null)).toBeNull();
  });

  it('tolerates missing components and images', () => {
    const t = parseTeardown({ id: 2, name: 'Kettle', weight_g: null });
    expect(t?.parts).toEqual([]);
    expect(t?.photos).toEqual([]);
  });

  it('drops parts with no name and keeps a null mass', () => {
    const t = parseTeardown({
      id: 3,
      name: 'Mouse',
      components: [
        { name: '', weight_g: 5 },
        { name: 'Shell', weight_g: null },
      ],
    });
    expect(t?.parts).toEqual([{ name: 'Shell', weightG: null, share: null, photo: null }]);
  });

  it('offers every pre-computed derivative as a srcset, narrowest first', () => {
    vi.stubEnv('PUBLIC_API_URL', 'http://api.test');
    const t = parseTeardown(RAW, [
      {
        name: 'Battery Pack',
        weight_g: 227,
        thumbnail_url: '/media/b_thumb_200.webp',
        // Deliberately out of order, and keyed by string as JSON delivers it.
        thumbnail_urls: {
          '800': '/media/b_thumb_800.webp',
          '200': '/media/b_thumb_200.webp',
        },
      },
    ]);
    expect(t?.parts[0].photo?.srcset).toBe(
      'http://api.test/media/b_thumb_200.webp 200w, http://api.test/media/b_thumb_800.webp 800w',
    );
    // The default stays the small one, for anything that ignores srcset.
    expect(t?.parts[0].photo?.url).toBe('http://api.test/media/b_thumb_200.webp');
  });

  it('offers no srcset when there is only one width to choose from', () => {
    const t = parseTeardown(RAW, [
      {
        name: 'Wifi Card',
        weight_g: 3.2,
        thumbnail_url: '/media/w.webp',
        thumbnail_urls: { '200': '/media/w.webp' },
      },
    ]);
    expect(t?.parts[0].photo?.srcset).toBe('');
  });

  it('drops unsafe derivative URLs from the srcset without losing the photo', () => {
    vi.stubEnv('PUBLIC_API_URL', 'http://api.test');
    const t = parseTeardown(RAW, [
      {
        name: 'Wifi Card',
        weight_g: 3.2,
        thumbnail_url: '/media/w_thumb_200.webp',
        thumbnail_urls: { '200': '/media/w_thumb_200.webp', '800': 'javascript:alert(1)' },
      },
    ]);
    expect(t?.parts[0].photo?.url).toBe('http://api.test/media/w_thumb_200.webp');
    expect(t?.parts[0].photo?.srcset).toBe('');
  });

  it('reads each part photo from the component thumbnail, at both tree levels', () => {
    vi.stubEnv('PUBLIC_API_URL', 'http://api.test');
    const t = parseTeardown(RAW, [
      {
        name: 'Display assembly',
        weight_g: 184,
        thumbnail_url: '/media/display-thumb.jpg',
        components: [{ name: 'LCD panel', weight_g: 121, thumbnail_url: '/media/lcd-thumb.jpg' }],
      },
    ]);
    expect(t?.parts[0].photo?.url).toBe('http://api.test/media/display-thumb.jpg');
    expect(t?.parts[0].children?.[0].photo?.url).toBe('http://api.test/media/lcd-thumb.jpg');
  });

  it('names the part, not the product, in each part photo alt text', () => {
    const t = parseTeardown(RAW, [
      { name: 'Cooling fan', weight_g: 24, thumbnail_url: '/media/fan.jpg', components: [] },
    ]);
    expect(t?.parts[0].photo?.alt).toBe('Cooling fan, photographed during disassembly');
  });

  it('ranks parts by recorded mass, heaviest first and unweighed last', () => {
    // Recording order, as the API returns it: a screw before the battery.
    const t = parseTeardown({
      ...RAW,
      components: [
        { name: 'Screws - torx', weight_g: 0.22 },
        { name: 'Bracket', weight_g: null },
        { name: 'Battery Pack', weight_g: 227 },
        { name: 'Keyboard Module', weight_g: 97 },
      ],
    });
    expect(t?.parts.map((p) => p.name)).toEqual([
      'Battery Pack',
      'Keyboard Module',
      'Screws - torx',
      'Bracket',
    ]);
    // Shares stay fractions of the whole product, so they descend with the mass.
    expect(t?.parts.map((p) => p.share)).toEqual([0.7, 0.299, 0.001, null]);
  });

  it('ranks the tree top level too, leaving each part children in record order', () => {
    const t = parseTeardown(RAW, [
      { name: 'Cooling fan', weight_g: 24, components: [] },
      {
        name: 'Display assembly',
        weight_g: 184,
        components: [
          { name: 'Lid and hinges', weight_g: 63 },
          { name: 'LCD panel', weight_g: 121 },
        ],
      },
    ]);
    expect(t?.parts.map((p) => p.name)).toEqual(['Display assembly', 'Cooling fan']);
    expect(t?.parts[0].children?.map((c) => c.name)).toEqual(['Lid and hinges', 'LCD panel']);
  });

  it('shows a CPV product type by its label, never by its code', () => {
    const cpv = { name: 'CPV: 302132', description: 'Tablet computer' };
    expect(parseTeardown({ ...RAW, product_type: cpv })?.productType).toBe('Tablet computer');

    // A code with no label is dropped rather than printed at the visitor.
    const bare = { name: 'CPV: 302132', description: null };
    expect(parseTeardown({ ...RAW, product_type: bare })?.productType).toBeUndefined();

    // A hand-authored type keeps its own name even when it has a description.
    const authored = { name: 'Laptop', description: 'A portable computer' };
    expect(parseTeardown({ ...RAW, product_type: authored })?.productType).toBe('Laptop');
  });

  it('drops an unsafe or absent component thumbnail to a null photo', () => {
    vi.stubEnv('PUBLIC_API_URL', 'http://api.test');
    for (const thumbnail_url of ['//evil.test/a.jpg', 'javascript:alert(1)', '', null]) {
      const t = parseTeardown(RAW, [{ name: 'Cooling fan', weight_g: 24, thumbnail_url }]);
      expect(t?.parts[0].photo).toBeNull();
    }
  });
});

const LIVE_PRODUCT = {
  id: 47,
  name: 'Framework 13',
  components: [{ name: 'Battery pack', weight_g: 212 }],
  images: [],
};
const LIVE_TREE = [{ name: 'Display assembly', weight_g: 184, components: [] }];

function jsonResponse(body: unknown) {
  return { ok: true, json: () => Promise.resolve(body) };
}

/**
 * Route fetch by URL substring; anything unmapped (the stats endpoints) fails,
 * which is the loader's own "no stats" path. Routes match in insertion order,
 * so the tree route has to come before the bare product route.
 */
function stubFetch(routes: Record<string, () => unknown>) {
  const fetchMock = vi.fn((url: string) => {
    const route = Object.keys(routes).find((path) => String(url).includes(path));
    return route ? Promise.resolve(routes[route]()) : Promise.reject(new Error(`unmapped ${url}`));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Silence one console method and keep the spy: the loader logs its source. */
function spyOnConsole(method: 'warn' | 'info') {
  return vi.spyOn(console, method).mockImplementation(() => undefined);
}

describe('loadLandingData', () => {
  let warn: ReturnType<typeof spyOnConsole>;
  let info: ReturnType<typeof spyOnConsole>;

  beforeEach(() => {
    vi.stubEnv('PUBLIC_API_URL', 'http://api.test');
    vi.stubEnv('PUBLIC_FEATURED_PRODUCT_ID', '47');
    warn = spyOnConsole('warn');
    info = spyOnConsole('info');
  });

  it('returns the live teardown, with the tree as its parts', async () => {
    stubFetch({
      '/components/tree': () => jsonResponse(LIVE_TREE),
      '/v1/products/47': () => jsonResponse(LIVE_PRODUCT),
    });

    const data = await loadLandingData();
    expect(data.fromFixture).toBe(false);
    expect(data.teardown?.name).toBe('Framework 13');
    expect(data.teardown?.parts.map((p) => p.name)).toEqual(['Display assembly']);
  });

  it('keeps the live teardown when the component tree fetch fails', async () => {
    stubFetch({
      '/components/tree': () => {
        throw new Error('tree down');
      },
      '/v1/products/47': () => jsonResponse(LIVE_PRODUCT),
    });

    const data = await loadLandingData();
    expect(data.fromFixture).toBe(false);
    expect(data.teardown?.parts.map((p) => p.name)).toEqual(['Battery pack']);
  });

  it('falls back to the fixture when the product fetch throws', async () => {
    stubFetch({});

    const data = await loadLandingData();
    expect(data.fromFixture).toBe(true);
    expect(data.teardown?.name).toBe('Dell XPS 13');
    // The fixture stores parts without shares; the loader computes them.
    expect(data.teardown?.parts[0].share).toBe(0.285);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('API unavailable at build time'));
  });

  it('falls back to the fixture on a non-ok response', async () => {
    stubFetch({ '/v1/products/47': () => ({ ok: false, status: 500 }) });

    await expect(loadLandingData()).resolves.toMatchObject({ fromFixture: true });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('API unavailable at build time'));
  });

  it('falls back to the fixture when the payload has no usable name', async () => {
    stubFetch({ '/v1/products/47': () => jsonResponse({ id: 47 }) });

    await expect(loadLandingData()).resolves.toMatchObject({ fromFixture: true });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('API unavailable at build time'));
  });

  // A blank, non-integer, zero or negative id is not a product to fetch.
  it.each(['', '  ', 'abc', '0', '-3', '4.5'])(
    'uses the fixture without warning for the featured product id %j',
    async (raw) => {
      vi.stubEnv('PUBLIC_FEATURED_PRODUCT_ID', raw);
      const fetchMock = stubFetch({ '/v1/products': () => jsonResponse(LIVE_PRODUCT) });

      await expect(loadLandingData()).resolves.toMatchObject({ fromFixture: true });

      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/v1/products'))).toBe(
        false,
      );
      expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('[landing]'));
      expect(info).toHaveBeenCalledWith(expect.stringContaining('no featured product configured'));
    },
  );
});

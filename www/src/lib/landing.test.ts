import { describe, expect, it } from 'vitest';
import { parseTeardown } from './landing.ts';

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

describe('parseTeardown', () => {
  it('maps the API payload to camelCase', () => {
    const t = parseTeardown(RAW);
    expect(t?.id).toBe(47);
    expect(t?.name).toBe('Dell XPS 13');
    expect(t?.weightG).toBe(1190);
    expect(t?.parts[0]).toEqual({ name: 'Battery pack', weightG: 212, share: 0.684 });
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
        children: [{ name: 'LCD panel', weightG: 121 }],
      },
      { name: 'Cooling fan', weightG: 24, share: 0.115 },
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

  it('prefers the thumbnail and falls back to the full image', () => {
    const t = parseTeardown(RAW);
    expect(t?.photos[0].url).toBe('/media/a-thumb.jpg');
    expect(t?.photos[1].url).toBe('/media/b.jpg');
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
    expect(t?.parts).toEqual([{ name: 'Shell', weightG: null, share: null }]);
  });
});

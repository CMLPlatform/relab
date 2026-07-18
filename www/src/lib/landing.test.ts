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
    expect(t?.parts[0]).toEqual({ name: 'Battery pack', weightG: 212 });
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
    expect(t?.parts).toEqual([{ name: 'Shell', weightG: null }]);
  });
});

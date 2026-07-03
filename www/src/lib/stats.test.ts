import { afterEach, describe, expect, it, vi } from 'vitest';

import { barPercent, fetchHomeStats, formatCount, formatMass } from './stats.ts';

const TOTALS_PAYLOAD = {
  totals: { teardowns: 12, parts: 340, mass_kg: 4200, images: 90, users: 7 },
  generated_at: '2026-06-01T00:00:00Z',
};
const CATEGORIES_PAYLOAD = {
  categories: [
    { name: 'Appliances', teardowns: 8, parts: 200 },
    { name: 'Electronics', teardowns: 4, parts: 140 },
  ],
};

function jsonResponse(body: unknown) {
  return { ok: true, json: () => Promise.resolve(body) };
}

function stubFetch(totals: unknown, categories: unknown) {
  const fetchMock = vi.fn((url: string) =>
    Promise.resolve(jsonResponse(String(url).includes('/totals') ? totals : categories)),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('fetchHomeStats', () => {
  it('fetches both endpoints and maps the response', async () => {
    vi.stubEnv('PUBLIC_API_URL', 'http://api.test/');
    const fetchMock = stubFetch(TOTALS_PAYLOAD, CATEGORIES_PAYLOAD);

    await expect(fetchHomeStats()).resolves.toEqual({
      totals: TOTALS_PAYLOAD.totals,
      categories: CATEGORIES_PAYLOAD.categories,
      generatedAt: '2026-06-01T00:00:00Z',
    });
    // Trailing slash on the base URL is stripped before joining paths.
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/v1/stats/totals',
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('returns null on a non-ok response', async () => {
    vi.stubEnv('PUBLIC_API_URL', 'http://api.test');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 500 })),
    );
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(fetchHomeStats()).resolves.toBeNull();
  });

  it('returns null when the totals shape has drifted', async () => {
    vi.stubEnv('PUBLIC_API_URL', 'http://api.test');
    stubFetch({ totals: { teardowns: 'many' }, generated_at: 'x' }, CATEGORIES_PAYLOAD);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(fetchHomeStats()).resolves.toBeNull();
  });

  it('drops categories with non-numeric teardown counts', async () => {
    vi.stubEnv('PUBLIC_API_URL', 'http://api.test');
    stubFetch(TOTALS_PAYLOAD, {
      categories: [{ name: 'Appliances', teardowns: 8, parts: 200 }, { name: 'Broken' }],
    });

    const stats = await fetchHomeStats();
    expect(stats?.categories).toEqual([{ name: 'Appliances', teardowns: 8, parts: 200 }]);
  });
});

describe('formatCount', () => {
  it('groups thousands and rounds', () => {
    expect(formatCount(18300)).toBe('18,300');
    expect(formatCount(1240.6)).toBe('1,241');
  });
});

describe('formatMass', () => {
  it('stays in kilograms below a tonne', () => {
    expect(formatMass(940)).toEqual({ value: '940', unit: 'kg' });
  });

  it('switches to tonnes with one decimal, then drops decimals when large', () => {
    expect(formatMass(4200)).toEqual({ value: '4.2', unit: 't' });
    expect(formatMass(42000)).toEqual({ value: '42', unit: 't' });
  });
});

describe('barPercent', () => {
  it('floors the smallest bar so it stays visible and caps the largest', () => {
    expect(barPercent(320, 320)).toBe(100);
    expect(barPercent(0, 320)).toBe(12);
  });

  it('returns 0 when there is no data', () => {
    expect(barPercent(5, 0)).toBe(0);
  });
});

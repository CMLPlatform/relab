import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildScale,
  fetchHomeStats,
  formatCount,
  formatMass,
  monthKeys,
  zeroFillSeries,
} from './stats.ts';

const TOTALS_PAYLOAD = {
  totals: { teardowns: 12, parts: 340, mass_kg: 4200, images: 90, users: 7 },
  generated_at: '2026-06-01T00:00:00Z',
};
const SERIES_PAYLOAD = {
  series: [{ period: '2026-06', teardowns: 3, parts: 40, mass_kg: 120, images: 9 }],
};

function jsonResponse(body: unknown) {
  return { ok: true, json: () => Promise.resolve(body) };
}

function stubFetch(totals: unknown, series: unknown) {
  const fetchMock = vi.fn((url: string) =>
    Promise.resolve(jsonResponse(String(url).includes('/totals') ? totals : series)),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('fetchHomeStats', () => {
  it('fetches both endpoints and zero-fills the series onto 12 months', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T00:00:00Z'));
    vi.stubEnv('PUBLIC_API_URL', 'http://api.test/');
    const fetchMock = stubFetch(TOTALS_PAYLOAD, SERIES_PAYLOAD);

    const stats = await fetchHomeStats();
    expect(stats?.totals).toEqual(TOTALS_PAYLOAD.totals);
    expect(stats?.generatedAt).toBe('2026-06-01T00:00:00Z');
    expect(stats?.series).toHaveLength(12);
    // The one month the API returned keeps its values; the rest become zeros.
    expect(stats?.series.at(-1)).toEqual(SERIES_PAYLOAD.series[0]);
    expect(stats?.series[0]).toEqual({
      period: '2025-07',
      teardowns: 0,
      parts: 0,
      mass_kg: 0,
      images: 0,
    });

    // Trailing slash on the base URL is stripped before joining paths.
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/v1/stats/totals',
      expect.objectContaining({ signal: expect.anything() }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/v1/stats/series?granularity=month&start=2025-07-01&end=2026-06-15',
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
    stubFetch({ totals: { teardowns: 'many' }, generated_at: 'x' }, SERIES_PAYLOAD);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(fetchHomeStats()).resolves.toBeNull();
  });

  it('drops series points with non-numeric measures', async () => {
    vi.stubEnv('PUBLIC_API_URL', 'http://api.test');
    stubFetch(TOTALS_PAYLOAD, { series: [{ period: '2026-06', teardowns: 'lots' }] });

    const stats = await fetchHomeStats();
    expect(stats?.series.every((point) => point.teardowns === 0)).toBe(true);
  });
});

describe('monthKeys', () => {
  it('ends on the current month and walks backwards', () => {
    expect(monthKeys(3, new Date('2026-01-20T00:00:00Z'))).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
    ]);
  });
});

describe('zeroFillSeries', () => {
  it('inserts zero months for periods the API omitted', () => {
    const present = { period: '2026-02', teardowns: 1, parts: 2, mass_kg: 3, images: 4 };
    expect(zeroFillSeries([present], ['2026-01', '2026-02'])).toEqual([
      { period: '2026-01', teardowns: 0, parts: 0, mass_kg: 0, images: 0 },
      present,
    ]);
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

describe('buildScale', () => {
  it('rounds the axis up to a clean step', () => {
    expect(buildScale(340, true)).toEqual({ yMax: 400, ticks: [0, 100, 200, 300, 400] });
  });

  it('forces a whole-number step for counts', () => {
    expect(buildScale(2, true).ticks).toEqual([0, 1, 2]);
  });

  it('allows a fractional step for continuous measures', () => {
    expect(buildScale(2, false).ticks).toEqual([0, 0.5, 1, 1.5, 2]);
  });

  it('never returns a zero-height axis for an all-zero series', () => {
    expect(buildScale(1, true).yMax).toBe(1);
  });
});

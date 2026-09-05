// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchHomeStats } from '@/lib/stats.ts';

import { applyRefresh, refreshLanding } from './landing-refresh.ts';

vi.mock('@/lib/stats.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/stats.ts')>()),
  fetchHomeStats: vi.fn(),
}));

const TOTALS = { teardowns: 50, parts: 1700, mass_kg: 355, images: 4000, users: 12 };

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('applyRefresh', () => {
  it('updates the metrics line in place, once the dip has run', () => {
    document.body.innerHTML = '<p data-metrics>old</p>';
    applyRefresh({ totals: TOTALS });
    const metrics = document.querySelector('[data-metrics]');

    // Text swaps at the bottom of the dip, not immediately.
    expect(metrics?.classList.contains('is-refreshing')).toBe(true);
    expect(metrics?.textContent).toBe('old');

    vi.advanceTimersByTime(180);
    expect(metrics?.textContent).toBe('1,700 parts documented');
    expect(metrics?.classList.contains('is-refreshing')).toBe(false);
  });

  it('skips the dip entirely when the figures are unchanged', () => {
    document.body.innerHTML = '<p data-metrics>old</p>';
    applyRefresh({ totals: TOTALS });
    vi.advanceTimersByTime(180);
    const settled = document.querySelector('[data-metrics]');
    const text = settled?.textContent;

    applyRefresh({ totals: TOTALS });

    expect(settled?.classList.contains('is-refreshing')).toBe(false);
    expect(settled?.textContent).toBe(text);
  });

  it('does nothing when the metrics node is absent', () => {
    document.body.innerHTML = '<p>no hook</p>';
    expect(() =>
      applyRefresh({ totals: { teardowns: 1, parts: 1, mass_kg: 1, images: 1, users: 1 } }),
    ).not.toThrow();
  });

  it('does nothing when given null', () => {
    document.body.innerHTML = '<p data-metrics>old</p>';
    applyRefresh(null);
    expect(document.querySelector('[data-metrics]')?.textContent).toBe('old');
  });
});

describe('refreshLanding', () => {
  it('skips the fetch when no [data-metrics] node is in the DOM', async () => {
    document.body.innerHTML = '<p>no hook</p>';

    await refreshLanding();

    expect(fetchHomeStats).not.toHaveBeenCalled();
  });

  it('fetches and applies the result when the node is present', async () => {
    document.body.innerHTML = '<p data-metrics>old</p>';
    vi.mocked(fetchHomeStats).mockResolvedValue({
      totals: TOTALS,
      series: [],
      generatedAt: '2026-06-01T00:00:00Z',
    });

    await refreshLanding();
    vi.advanceTimersByTime(180);

    expect(document.querySelector('[data-metrics]')?.textContent).toBe('1,700 parts documented');
  });
});

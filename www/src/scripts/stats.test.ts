// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { HomeStats, SeriesPoint } from '@/lib/stats.ts';
import { fetchHomeStats } from '@/lib/stats.ts';
import { renderStats } from './stats.ts';

vi.mock('@/lib/stats.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/stats.ts')>()),
  fetchHomeStats: vi.fn(),
}));

const SERIES: SeriesPoint[] = Array.from({ length: 12 }, (_, i) => ({
  period: `2026-${String(i + 1).padStart(2, '0')}`,
  teardowns: i,
  parts: i * 10,
  mass_kg: i * 5,
  images: i * 2,
}));

const STATS: HomeStats = {
  totals: { teardowns: 1234, parts: 5678, mass_kg: 4200, images: 90, users: 7 },
  series: SERIES,
  generatedAt: '2026-06-01T00:00:00Z',
};

// Mirrors the data-stat contract of src/components/StatsPanel.astro.
function buildPanel() {
  document.body.innerHTML = `
    <section id="stats-panel" hidden>
      <span data-stat="hero">—</span>
      <div data-stat="tiles"></div>
      <div class="stats-activity">
        <h3 data-stat="chart-heading"></h3>
        <div data-stat="controls"></div>
        <div data-stat="chart"></div>
        <div data-stat="table"></div>
      </div>
      <p data-stat="caption"></p>
    </section>
  `;
  const panel = document.getElementById('stats-panel');
  if (!panel) {
    throw new Error('buildPanel: missing panel');
  }
  return panel;
}

function statText(panel: HTMLElement, key: string) {
  return panel.querySelector(`[data-stat="${key}"]`)?.textContent;
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.mocked(fetchHomeStats).mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('renderStats', () => {
  it('leads with parts as the hero figure and fills the stat tiles', async () => {
    const panel = buildPanel();
    vi.mocked(fetchHomeStats).mockResolvedValue(STATS);

    await renderStats();

    expect(statText(panel, 'hero')).toBe('5,678');
    const tiles = [...panel.querySelectorAll('.stats-tile')].map((t) => t.textContent);
    expect(tiles).toEqual(['1,234teardowns', '4.2tmass logged', '90photos']);
    expect(statText(panel, 'caption')).toContain('7 contributors');
    expect(panel.hidden).toBe(false);
  });

  it('draws one bar per month, defaulting to the parts measure', async () => {
    const panel = buildPanel();
    vi.mocked(fetchHomeStats).mockResolvedValue(STATS);

    await renderStats();

    // 12 months, but the first has a value of 0 and so draws no mark.
    expect(panel.querySelectorAll('.stats-chart-bar')).toHaveLength(11);
    expect(panel.querySelectorAll('.stats-chart-hits rect')).toHaveLength(12);
    expect(statText(panel, 'chart-heading')).toBe('Parts per month · last 12 months');
    expect(panel.querySelector('.stats-toggle[aria-pressed="true"]')?.textContent).toBe('Parts');
  });

  it('direct-labels only the extreme column', async () => {
    const panel = buildPanel();
    vi.mocked(fetchHomeStats).mockResolvedValue(STATS);

    await renderStats();

    const peaks = panel.querySelectorAll('.stats-chart-peak');
    expect(peaks).toHaveLength(1);
    expect(peaks[0].textContent).toBe('110'); // parts for the last month
  });

  it('keeps the hover layer hidden until a column is active', async () => {
    const panel = buildPanel();
    vi.mocked(fetchHomeStats).mockResolvedValue(STATS);

    await renderStats();

    // `hidden` is an HTML attribute and is inert on SVG, so the tooltip and
    // crosshair must be gated by a class or they render at the origin.
    for (const selector of ['.stats-chart-tip', '.stats-chart-crosshair']) {
      const layer = panel.querySelector(selector);
      expect(layer).not.toBeNull();
      expect(layer?.classList.contains('is-visible')).toBe(false);
    }
  });

  it('exposes every value in a table twin, so nothing is hover-gated', async () => {
    const panel = buildPanel();
    vi.mocked(fetchHomeStats).mockResolvedValue(STATS);

    await renderStats();

    const rows = panel.querySelectorAll('[data-stat="table"] tbody tr');
    expect(rows).toHaveLength(12);
    expect(rows[11].textContent).toBe('2026-12110');
  });

  it('switches the chart, heading, and table when a measure is selected', async () => {
    const panel = buildPanel();
    vi.mocked(fetchHomeStats).mockResolvedValue(STATS);

    await renderStats();
    panel.querySelector<HTMLButtonElement>('.stats-toggle[data-measure="mass_kg"]')?.click();

    expect(statText(panel, 'chart-heading')).toBe('Mass per month (kg) · last 12 months');
    expect(panel.querySelector('.stats-chart-peak')?.textContent).toBe('55kg');
    // The hero stays pinned to parts; only the chart follows the toggle.
    expect(statText(panel, 'hero')).toBe('5,678');
  });

  it('leaves the panel hidden when the fetch fails', async () => {
    const panel = buildPanel();
    vi.mocked(fetchHomeStats).mockResolvedValue(null);

    await renderStats();

    expect(panel.hidden).toBe(true);
    expect(statText(panel, 'hero')).toBe('—');
  });

  it('removes the activity block when no series is returned', async () => {
    const panel = buildPanel();
    vi.mocked(fetchHomeStats).mockResolvedValue({ ...STATS, series: [] });

    await renderStats();

    expect(panel.querySelector('.stats-activity')).toBeNull();
    expect(panel.hidden).toBe(false);
  });

  it('does nothing without a stats panel in the document', async () => {
    vi.mocked(fetchHomeStats).mockResolvedValue(STATS);

    await expect(renderStats()).resolves.toBeUndefined();
    expect(fetchHomeStats).not.toHaveBeenCalled();
  });
});

describe('chart tooltip', () => {
  async function buildChart() {
    const panel = buildPanel();
    vi.mocked(fetchHomeStats).mockResolvedValue(STATS);
    await renderStats();
    const root = panel.querySelector<SVGSVGElement>('[data-stat="chart"] svg');
    if (!root) {
      throw new Error('buildChart: missing chart svg');
    }
    return { panel, root };
  }

  function tipText(panel: HTMLElement) {
    return {
      label: panel.querySelector('.stats-chart-tip-label')?.textContent,
      value: panel.querySelector('.stats-chart-tip-value')?.textContent,
    };
  }

  function isVisible(panel: HTMLElement) {
    return panel.querySelector('.stats-chart-tip')?.classList.contains('is-visible');
  }

  it('steps through months on ArrowRight/ArrowLeft, preventing default so the page does not scroll', async () => {
    const { panel, root } = await buildChart();

    const right = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true });
    root.dispatchEvent(right);
    expect(right.defaultPrevented).toBe(true);
    expect(isVisible(panel)).toBe(true);
    expect(tipText(panel)).toEqual({ label: 'Jan', value: '0' }); // parts for month 1

    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));
    expect(tipText(panel)).toEqual({ label: 'Feb', value: '10' });

    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true }));
    expect(tipText(panel)).toEqual({ label: 'Jan', value: '0' });
  });

  it('clamps ArrowLeft/ArrowRight at the series bounds', async () => {
    const { panel, root } = await buildChart();

    // Already at the first month: ArrowLeft must not step past it.
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true }));
    expect(tipText(panel)).toEqual({ label: 'Jan', value: '0' });

    // Walk to the last month, then one more ArrowRight must hold there.
    for (let i = 0; i < 12; i++) {
      root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));
    }
    expect(tipText(panel)).toEqual({ label: 'Dec', value: '110' });
  });

  it('dismisses the tooltip on Escape without preventing default', async () => {
    const { panel, root } = await buildChart();
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));
    expect(isVisible(panel)).toBe(true);

    const escapeKey = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    root.dispatchEvent(escapeKey);

    expect(isVisible(panel)).toBe(false);
    expect(escapeKey.defaultPrevented).toBe(false);
  });

  it('shows the tooltip on hit-target mouseenter and hides it on mouseleave', async () => {
    const { panel, root } = await buildChart();
    const hits = panel.querySelectorAll('.stats-chart-hits rect');
    expect(hits).toHaveLength(12);

    hits[5].dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    expect(isVisible(panel)).toBe(true);
    expect(tipText(panel)).toEqual({ label: 'Jun', value: '50' });

    root.dispatchEvent(new MouseEvent('mouseleave'));
    expect(isVisible(panel)).toBe(false);
  });
});

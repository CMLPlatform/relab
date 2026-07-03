// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { HomeStats } from '@/lib/stats.ts';
import { fetchHomeStats } from '@/lib/stats.ts';
import { renderStats } from './stats.ts';

vi.mock('@/lib/stats.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/stats.ts')>()),
  fetchHomeStats: vi.fn(),
}));

const STATS: HomeStats = {
  totals: { teardowns: 1234, parts: 5678, mass_kg: 4200, images: 90, users: 7 },
  categories: [
    { name: 'Appliances', teardowns: 8, parts: 200 },
    { name: 'Electronics', teardowns: 4, parts: 140 },
  ],
  generatedAt: '2026-06-01T00:00:00Z',
};

// Mirrors the data-stat contract of src/components/StatsPanel.astro.
function buildPanel() {
  document.body.innerHTML = `
    <section id="stats-panel" hidden>
      <span data-stat="teardowns">—</span>
      <span data-stat="parts">—</span>
      <span data-stat="mass">—</span>
      <span data-stat="mass-unit"></span>
      <span data-stat="images">—</span>
      <div class="stats-categories">
        <ul data-stat="bars"></ul>
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
  it('populates the figures and reveals the panel', async () => {
    const panel = buildPanel();
    vi.mocked(fetchHomeStats).mockResolvedValue(STATS);

    await renderStats();

    expect(statText(panel, 'teardowns')).toBe('1,234');
    expect(statText(panel, 'parts')).toBe('5,678');
    expect(statText(panel, 'mass')).toBe('4.2');
    expect(statText(panel, 'mass-unit')).toBe('t');
    expect(statText(panel, 'images')).toBe('90');
    expect(statText(panel, 'caption')).toContain('7 contributors');
    expect(panel.querySelectorAll('.stats-bar-row')).toHaveLength(2);
    expect(panel.hidden).toBe(false);
    expect(panel.classList.contains('content-reveal')).toBe(true);
  });

  it('leaves the panel hidden when the fetch fails', async () => {
    const panel = buildPanel();
    vi.mocked(fetchHomeStats).mockResolvedValue(null);

    await renderStats();

    expect(panel.hidden).toBe(true);
    expect(statText(panel, 'teardowns')).toBe('—');
  });

  it('removes the categories block when no categories are returned', async () => {
    const panel = buildPanel();
    vi.mocked(fetchHomeStats).mockResolvedValue({ ...STATS, categories: [] });

    await renderStats();

    expect(panel.querySelector('.stats-categories')).toBeNull();
    expect(panel.hidden).toBe(false);
  });

  it('does nothing without a stats panel in the document', async () => {
    vi.mocked(fetchHomeStats).mockResolvedValue(STATS);

    await expect(renderStats()).resolves.toBeUndefined();
    expect(fetchHomeStats).not.toHaveBeenCalled();
  });
});

// Post-load refresh of the hero's baked metrics line (progressive
// enhancement, same CSP allowance as src/scripts/stats.ts). The baked page is
// already correct; this only rewrites the text of the existing [data-metrics]
// node in place — it never adds, removes, or resizes elements, so it cannot
// cause layout shift. The teardown parts list stays untouched. On any failure
// it does nothing.

import { fetchHomeStats, formatCount, type HomeStats } from '@/lib/stats.ts';

/** Rewrite the metrics line's text in place. Same wording as the baked hero. */
export function applyRefresh(stats: Pick<HomeStats, 'totals'> | null): void {
  const metrics = document.querySelector('[data-metrics]');
  if (!(metrics && stats)) {
    return;
  }
  const { teardowns, parts, mass_kg } = stats.totals;
  metrics.textContent =
    `${formatCount(teardowns)} teardowns · ${formatCount(parts)} parts · ` +
    `${formatCount(mass_kg)} kg logged`;
}

/** Fetch fresh totals and apply them. No baked metrics line -> no fetch. */
export async function refreshLanding(): Promise<void> {
  if (!document.querySelector('[data-metrics]')) {
    return;
  }
  applyRefresh(await fetchHomeStats());
}

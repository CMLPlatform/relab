// Post-load refresh of the hero's baked metrics line (progressive
// enhancement, same CSP allowance as src/scripts/stats.ts). The baked page is
// already correct; this only rewrites the text of the existing [data-metrics]
// node in place, carried by a short opacity dip so the change reads as a
// refresh rather than a glitch; it never adds, removes, or resizes elements,
// so it cannot cause layout shift. The teardown parts list stays untouched. On
// any failure it does nothing.

import { fetchHomeStats, formatCount, type HomeStats } from '@/lib/stats.ts';

/** Rewrite the metrics line's text in place. Same wording as the baked hero. */
export function applyRefresh(stats: Pick<HomeStats, 'totals'> | null): void {
  const metrics = document.querySelector('[data-metrics]');
  if (!(metrics && stats)) {
    return;
  }
  const next = `${formatCount(stats.totals.parts)} parts documented`;
  // Unchanged figures are the common case, and a dip that means nothing is
  // worse than no dip at all.
  if (metrics.textContent?.trim() === next) {
    return;
  }
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    metrics.textContent = next;
    return;
  }
  metrics.classList.add('is-refreshing');
  // Swap at the bottom of the dip; dropping the class fades it back up.
  window.setTimeout(() => {
    metrics.textContent = next;
    metrics.classList.remove('is-refreshing');
  }, 180);
}

/** Fetch fresh totals and apply them. No baked metrics line -> no fetch. */
export async function refreshLanding(): Promise<void> {
  if (!document.querySelector('[data-metrics]')) {
    return;
  }
  applyRefresh(await fetchHomeStats());
}

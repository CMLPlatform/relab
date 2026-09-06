// Post-load refresh of the hero's baked metrics line. Rewrites the text of the
// existing [data-metrics] node in place under a short opacity dip; never adds,
// removes, or resizes elements, so no layout shift. On any failure it does nothing.

import { fetchHomeStats, formatCount, type HomeStats } from '@/lib/stats.ts';

/** Rewrite the metrics line's text in place. Same wording as the baked hero. */
export function applyRefresh(stats: Pick<HomeStats, 'totals'> | null): void {
  const metrics = document.querySelector('[data-metrics]');
  if (!(metrics && stats)) {
    return;
  }
  const next = `${formatCount(stats.totals.parts)} parts documented`;
  // No dip for unchanged figures, the common case.
  if (metrics.textContent?.trim() === next) {
    return;
  }
  // The baked hero hides this node when the build had no stats; reveal it
  // without a dip, since it was not visible to fade.
  const wasHidden = metrics.hasAttribute('hidden');
  if (wasHidden) {
    metrics.textContent = next;
    metrics.removeAttribute('hidden');
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

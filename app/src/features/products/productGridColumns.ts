const MAX_CONTENT_WIDTH = 1100;

/**
 * Column count for the products grid, derived from the width actually available
 * inside PageContainer (phoneFullBleed) — the window width capped at the
 * container max, minus the md/lg gutters — not the raw window width, which
 * overcounts columns near a tier boundary (e.g. a 1024px window only has ~960px
 * of usable content, which comfortably fits 2 columns, not 3).
 *
 * PageContainer `phoneFullBleed` gutters mirror `md:px-6` (48px total at ≥768)
 * and `lg:px-8` (64px total at ≥1024); the phone tier is full-bleed (no gutter).
 */
export function productGridColumns(windowWidth: number): number {
  if (windowWidth < 600) return 1;
  const gutter = windowWidth >= 1024 ? 64 : windowWidth >= 768 ? 48 : 0;
  const contentWidth = Math.min(windowWidth, MAX_CONTENT_WIDTH) - gutter;
  return contentWidth < 1000 ? 2 : 3;
}

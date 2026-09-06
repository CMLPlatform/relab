const MAX_CONTENT_WIDTH = 1100;

/**
 * Column count for the products grid, from the width available inside
 * PageContainer (phoneFullBleed), not the raw window width, which overcounts
 * near a tier boundary. Gutters mirror `md:px-6` (48px total at >=768) and
 * `lg:px-8` (64px total at >=1024); the phone tier has none.
 */
export function productGridColumns(windowWidth: number): number {
  if (windowWidth < 600) return 1;
  const gutter = windowWidth >= 1024 ? 64 : windowWidth >= 768 ? 48 : 0;
  const contentWidth = Math.min(windowWidth, MAX_CONTENT_WIDTH) - gutter;
  return contentWidth < 1000 ? 2 : 3;
}

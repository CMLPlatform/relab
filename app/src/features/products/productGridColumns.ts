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

/**
 * Rows a product grid renders before its first scroll. FlatList counts rows, not
 * cards, once numColumns > 1; four rows covers the first screen at every column
 * count, and the rest of a page renders in later batches. Rows vary in height, so
 * there is no getItemLayout.
 */
export const PRODUCT_GRID_INITIAL_ROWS = 4;

/**
 * Windowing for the product grids. A batch is one first screen of rows, so a
 * scroll catches up in small steps instead of FlatList's default ten rows of
 * cards (thirty on three columns) per frame. The window keeps five screens
 * either side mounted, down from the default ten: cards stay in the DOM for
 * find-in-page a good way past the viewport, at half the mounted images.
 */
export const PRODUCT_GRID_WINDOWING = {
  initialNumToRender: PRODUCT_GRID_INITIAL_ROWS,
  maxToRenderPerBatch: PRODUCT_GRID_INITIAL_ROWS,
  windowSize: 11,
} as const;

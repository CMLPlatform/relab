import { spacing } from '@/constants';

/** Kept in sync with `Menu`'s `styles.content.minWidth` — the flip needs it. */
export const MENU_MIN_WIDTH = 180;
/** Breathing room between the menu and the viewport edge. */
export const EDGE_MARGIN = spacing.sm;

export type MenuPosition = { top: number; left: number } | { top: number; right: number };

/**
 * Where to pin an anchored menu. Left-anchored by default; flipped to
 * right-anchored near the right edge (flipping stays correct for menus whose
 * width is unknown until layout). Not in Menu.tsx (Fast Refresh).
 */
export function getMenuPosition({
  anchorX,
  anchorY,
  anchorWidth,
  anchorHeight,
  windowWidth,
}: {
  anchorX: number;
  anchorY: number;
  anchorWidth: number;
  anchorHeight: number;
  windowWidth: number;
}): MenuPosition {
  const top = anchorY + anchorHeight + spacing.xs;
  const overflowsRight = anchorX + MENU_MIN_WIDTH + EDGE_MARGIN > windowWidth;
  return overflowsRight
    ? { top, right: Math.max(EDGE_MARGIN, windowWidth - (anchorX + anchorWidth)) }
    : { top, left: Math.max(EDGE_MARGIN, anchorX) };
}

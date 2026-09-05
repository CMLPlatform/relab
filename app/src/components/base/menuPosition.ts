import { spacing } from '@/constants';

/** Kept in sync with `Menu`'s `styles.content.minWidth` — the flip needs it. */
export const MENU_MIN_WIDTH = 180;
/** Breathing room between the menu and the viewport edge. */
export const EDGE_MARGIN = spacing.sm;

export type MenuPosition = { top: number; left: number } | { top: number; right: number };

/**
 * Where to pin an anchored menu, given its measured anchor.
 *
 * Left-anchored by default, so the menu grows rightwards from the anchor. For
 * an anchor near the right edge that runs it off-screen, so flip to
 * right-anchored and let it grow inwards instead. Flipping (rather than
 * clamping `left`) stays correct for menus wider than the minimum, whose width
 * isn't known until after layout.
 *
 * Lives apart from Menu.tsx because a component file can only export
 * components without breaking fast refresh.
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

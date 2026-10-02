import { spacing } from '@/constants';

/** Kept in sync with `Menu`'s `styles.content.minWidth`; the flip needs it. */
export const MENU_MIN_WIDTH = 180;
/** Breathing room between the menu and the viewport edge. */
export const EDGE_MARGIN = spacing.sm;

export type MenuPosition = ({ top: number } | { bottom: number }) &
  ({ left: number } | { right: number });

/**
 * Where to pin an anchored menu. Opens below and left-anchored by default;
 * flipped to open above when the anchor sits in the lower half of the window,
 * and to right-anchored near the right edge (pinning the far side stays
 * correct for menus whose size is unknown until layout). Not in Menu.tsx
 * (Fast Refresh).
 */
export function getMenuPosition({
  anchorX,
  anchorY,
  anchorWidth,
  anchorHeight,
  windowWidth,
  windowHeight,
}: {
  anchorX: number;
  anchorY: number;
  anchorWidth: number;
  anchorHeight: number;
  windowWidth: number;
  windowHeight: number;
}): MenuPosition {
  const opensUp = anchorY + anchorHeight / 2 > windowHeight / 2;
  const vertical = opensUp
    ? { bottom: windowHeight - anchorY + spacing.xs }
    : { top: anchorY + anchorHeight + spacing.xs };
  const overflowsRight = anchorX + MENU_MIN_WIDTH + EDGE_MARGIN > windowWidth;
  return overflowsRight
    ? { ...vertical, right: Math.max(EDGE_MARGIN, windowWidth - (anchorX + anchorWidth)) }
    : { ...vertical, left: Math.max(EDGE_MARGIN, anchorX) };
}

const MENU_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Home', 'End']);

/** The item a menu key moves focus to (wrapping), or null for any other key. */
export function nextMenuIndex(key: string, index: number, count: number): number | null {
  if (count === 0 || !MENU_KEYS.has(key)) return null;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (index < 0) return key === 'ArrowDown' ? 0 : count - 1;
  return (index + (key === 'ArrowDown' ? 1 : -1) + count) % count;
}

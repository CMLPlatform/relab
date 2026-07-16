import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { Icon, type IconName } from '@/components/base/Icon';
import { radius, spacing } from '@/constants';
import { useAppTheme } from '@/theme';

type MenuProps = {
  visible: boolean;
  onDismiss: () => void;
  anchor: ReactNode;
  children: ReactNode;
};

/** Kept in sync with `styles.content.minWidth` — the flip decision needs it. */
const MENU_MIN_WIDTH = 180;
/** Breathing room between the menu and the viewport edge. */
const EDGE_MARGIN = spacing.sm;

type Position = { top: number; left: number } | { top: number; right: number };

/**
 * Where to pin the menu relative to a measured anchor. Exported for tests: the
 * flip is the only non-obvious part of this component.
 *
 * Left-anchored by default, so the menu grows rightwards from the anchor. For
 * an anchor near the right edge that runs it off-screen, so flip to
 * right-anchored and let it grow inwards instead. Flipping (rather than
 * clamping `left`) stays correct for menus wider than the minimum, whose width
 * isn't known until after layout.
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
}): Position {
  const top = anchorY + anchorHeight + spacing.xs;
  const overflowsRight = anchorX + MENU_MIN_WIDTH + EDGE_MARGIN > windowWidth;
  return overflowsRight
    ? { top, right: Math.max(EDGE_MARGIN, windowWidth - (anchorX + anchorWidth)) }
    : { top, left: Math.max(EDGE_MARGIN, anchorX) };
}

/**
 * Anchored dropdown menu, replacing react-native-paper's Menu. Renders in an
 * RN-core Modal (no PortalHost involved) with a full-screen dismiss backdrop;
 * position is measured from the anchor once the menu opens.
 *
 * NOTE: position is captured on open only, not tracked live — a menu left
 * open while its anchor scrolls out from under it (e.g. a chip in a
 * horizontally-scrolling filter bar) won't follow it. Matches how most
 * non-portal dropdown implementations behave; revisit if it's ever left open
 * during a scroll in practice.
 */
export function Menu({ visible, onDismiss, anchor, children }: MenuProps) {
  const theme = useAppTheme();
  const anchorRef = useRef<View>(null);
  const { width: windowWidth } = useWindowDimensions();
  const [position, setPosition] = useState<Position>({ top: 0, left: 0 });

  useEffect(() => {
    if (!visible) return;
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      setPosition(
        getMenuPosition({
          anchorX: x,
          anchorY: y,
          anchorWidth: width,
          anchorHeight: height,
          windowWidth,
        }),
      );
    });
  }, [visible, windowWidth]);

  return (
    <>
      <View ref={anchorRef} collapsable={false}>
        {anchor}
      </View>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onDismiss}
          accessibilityLabel="Dismiss menu"
        >
          {/* Swallow presses so tapping an item doesn't fall through to the backdrop. */}
          <Pressable
            onPress={(e) => e.stopPropagation()}
            accessibilityRole="menu"
            style={[
              styles.content,
              position,
              theme.tokens.elevation.overlay,
              { backgroundColor: theme.colors.elevation.level2 },
            ]}
          >
            {children}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function MenuItem({
  title,
  trailingIcon,
  onPress,
}: {
  title: string;
  trailingIcon?: IconName;
  onPress: () => void;
}) {
  const theme = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="menuitem"
      style={({ pressed }) => [
        styles.item,
        pressed && { backgroundColor: theme.colors.surfaceVariant },
      ]}
    >
      <AppText testID="menu-item-title" style={styles.itemLabel}>
        {title}
      </AppText>
      {trailingIcon ? <Icon name={trailingIcon} size="md" color={theme.colors.onSurface} /> : null}
    </Pressable>
  );
}

Menu.Item = MenuItem;

const styles = StyleSheet.create({
  content: {
    position: 'absolute',
    minWidth: MENU_MIN_WIDTH,
    maxWidth: '92%',
    // Floating surface: overlay radius + the shared overlay elevation tier
    // (applied inline below, since it is theme-dependent).
    borderRadius: radius.overlay,
    paddingVertical: spacing.xs,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  itemLabel: {
    flexShrink: 1,
  },
});

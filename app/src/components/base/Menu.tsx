import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { Icon, type IconName } from '@/components/base/Icon';
import { useAppTheme } from '@/theme';
import { getMenuPosition, MENU_MIN_WIDTH, type MenuPosition } from './menuPosition';

// Swallow presses so tapping an item doesn't fall through to the backdrop. Module-level
// so it's a stable reference across renders.
function stopPropagation(e: { stopPropagation: () => void }) {
  e.stopPropagation();
}

type MenuProps = {
  visible: boolean;
  onDismiss: () => void;
  anchor: ReactNode;
  children: ReactNode;
};

/**
 * Anchored dropdown menu, replacing react-native-paper's Menu. Renders in an
 * RN-core Modal (no PortalHost involved) with a full-screen dismiss backdrop;
 * position is measured from the anchor once the menu opens.
 *
 * NOTE (2026-08-05): re-confirmed during the ui/ kit adoption pass — this stays on
 * RN-core Modal + measureInWindow anchoring; `ui/dropdown-menu` needs a PortalHost
 * the app doesn't mount and would not preserve this anchoring behavior.
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
  const [position, setPosition] = useState<MenuPosition>({ top: 0, left: 0 });

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
          <Pressable
            onPress={stopPropagation}
            accessibilityRole="menu"
            className="rounded-xl py-1"
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
  const pressableStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [
      pressed && { backgroundColor: theme.colors.surfaceVariant },
    ],
    [theme.colors.surfaceVariant],
  );
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="menuitem"
      className="min-h-11 flex-row items-center justify-between gap-2 px-4"
      style={pressableStyle}
    >
      <AppText testID="menu-item-title" className="shrink">
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
    // Floating surface: overlay radius (rounded-xl class) + the shared
    // overlay elevation tier (applied inline, since it is theme-dependent).
  },
});

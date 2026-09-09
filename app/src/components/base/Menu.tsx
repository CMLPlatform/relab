import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { AppText } from '@/components/base/AppText';
import { Icon, type IconName } from '@/components/base/Icon';
import { MIN_TAP_TARGET } from '@/constants';
import { useAppTheme } from '@/theme';
import { getMenuPosition, MENU_MIN_WIDTH, type MenuPosition } from './menuPosition';

// Swallow presses so tapping an item does not fall through to the backdrop.
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
 * Anchored dropdown menu in RN-core Modal with a full-screen dismiss backdrop.
 *
 * NOTE: hand-rolled on purpose; uses RN-core Modal + measureInWindow anchoring for portal-free positioning.
 *
 * NOTE: position is captured on open only; a menu does not follow an anchor
 * that scrolls away.
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
          <Animated.View
            entering={FadeInDown.duration(150)
              .easing(Easing.out(Easing.quad))
              .reduceMotion(ReduceMotion.System)}
            style={[styles.content, position]}
          >
            <Pressable
              onPress={stopPropagation}
              accessibilityRole="menu"
              // Floating tier: page ground plus shadow-overlay, like AppDialog's surface.
              className="rounded-xl bg-background py-1"
              style={theme.tokens.elevation.overlay}
            >
              {children}
            </Pressable>
          </Animated.View>
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
      // No className on this Pressable: it would drop this function (see IconButton.tsx).
      styles.item,
      pressed && { backgroundColor: theme.colors.surfaceVariant },
    ],
    [theme.colors.surfaceVariant],
  );
  return (
    <Pressable onPress={onPress} accessibilityRole="menuitem" style={pressableStyle}>
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
    // Overlay elevation applied inline (theme-dependent).
  },
  item: {
    minHeight: MIN_TAP_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 16,
  },
});

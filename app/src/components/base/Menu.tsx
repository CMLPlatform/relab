import type { ReactNode, RefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, FadeInDown, FadeInUp, ReduceMotion } from 'react-native-reanimated';
import { AppText } from '@/components/base/AppText';
import { Icon, type IconName } from '@/components/base/Icon';
import { MIN_TAP_TARGET } from '@/constants';
import { useReturnFocus } from '@/hooks/useReturnFocus';
import { useAppTheme } from '@/theme/appThemeContext';
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
  /** Return-focus target for native screen readers on close; see AppDialog's `triggerRef`. */
  triggerRef?: RefObject<View | null>;
};

/**
 * Anchored dropdown menu in RN-core Modal with a full-screen dismiss backdrop.
 *
 * NOTE: hand-rolled on purpose; uses RN-core Modal + measureInWindow anchoring for portal-free positioning.
 *
 * NOTE: position is captured on open only; a menu does not follow an anchor
 * that scrolls away.
 */
export function Menu({ visible, onDismiss, anchor, children, triggerRef }: MenuProps) {
  const theme = useAppTheme();
  useReturnFocus(visible, triggerRef);
  const anchorRef = useRef<View>(null);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
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
          windowHeight,
        }),
      );
    });
  }, [visible, windowWidth, windowHeight]);

  return (
    <>
      <View ref={anchorRef} collapsable={false}>
        {anchor}
      </View>
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onDismiss}
        aria-label="Menu"
      >
        {/* Scrim and wrapper are not controls: see AppDialog. */}
        <Pressable
          accessible={false}
          testID="menu-scrim"
          style={StyleSheet.absoluteFill}
          onPress={onDismiss}
        >
          <Animated.View
            entering={('bottom' in position ? FadeInUp : FadeInDown)
              .duration(150)
              .easing(Easing.out(Easing.quad))
              .reduceMotion(ReduceMotion.System)}
            style={[styles.content, position]}
          >
            <Pressable
              // Not accessible: a focusable group would hide the items from VoiceOver.
              // The role still reaches the DOM on web; the Modal carries the name.
              accessible={false}
              testID="menu-popover"
              onPress={stopPropagation}
              accessibilityRole="menu"
              aria-label="Menu"
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
  checked,
  onPress,
}: {
  title: string;
  trailingIcon?: IconName;
  /** Marks the item as one choice of a group: `menuitemradio` plus its checked state. */
  checked?: boolean;
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
    <Pressable
      onPress={onPress}
      // NOTE: menuitemradio is a valid ARIA role that react-native-web passes through but RN's
      // types omit, and Android's native role enum rejects it (the view manager throws). Native
      // keeps menuitem and carries the choice state in aria-checked -> accessibilityState.checked.
      accessibilityRole={
        (Platform.OS === 'web' && checked !== undefined
          ? 'menuitemradio'
          : 'menuitem') as 'menuitem'
      }
      // aria-*, not accessibilityState: only the aria props reach the DOM on web.
      aria-checked={checked}
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

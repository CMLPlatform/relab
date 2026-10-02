import type { ReactNode, RefObject } from 'react';
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  FadeInUp,
  ReduceMotion,
  useReducedMotion,
} from 'react-native-reanimated';
import { AppText } from '@/components/base/AppText';
import { Icon, type IconName } from '@/components/base/Icon';
import { MIN_TAP_TARGET } from '@/constants';
import { useReturnFocus } from '@/hooks/useReturnFocus';
import { useAppTheme } from '@/theme/appThemeContext';
import { getMenuPosition, MENU_MIN_WIDTH, type MenuPosition, nextMenuIndex } from './menuPosition';

// Swallow presses so tapping an item does not fall through to the backdrop.
function stopPropagation(e: { stopPropagation: () => void }) {
  e.stopPropagation();
}

/**
 * Web keyboard model for an open menu (WAI-ARIA menu pattern): focus starts
 * on the checked item, else the first; arrows move and wrap; Home/End jump.
 * Roving tabindex: only the focused item is in the tab order, and Tab closes
 * the menu (focus returns to the trigger) instead of walking the items.
 * Escape is the Modal's own `onRequestClose`. Native screen readers swipe
 * between items, so this is web-only.
 */
function useWebMenuKeyboard(popover: HTMLElement | null, onDismiss: () => void) {
  // An effect event, so a caller's inline onDismiss does not re-run the effect and refocus the first item.
  const dismiss = useEffectEvent(onDismiss);
  useEffect(() => {
    // A host node without DOM methods is a test renderer under a mocked web platform.
    if (!popover || typeof popover.querySelectorAll !== 'function') return;
    // biome-ignore lint/security/noSecrets: an ARIA attribute selector, not a secret.
    const items = () => Array.from(popover.querySelectorAll<HTMLElement>('[role^="menuitem"]'));
    // Reanimated's entering animation holds the popover at visibility:hidden
    // until its first frame, and focus() on a hidden element does nothing, so
    // retry per frame (bounded) until the starting item takes focus.
    let frame = 0;
    let raf = 0;
    // Pointer focus included: whichever item holds focus is the one tab stop.
    const onFocusIn = (event: FocusEvent) => {
      const list = items();
      if (!list.includes(event.target as HTMLElement)) return;
      for (const item of list) item.tabIndex = item === event.target ? 0 : -1;
    };
    popover.addEventListener('focusin', onFocusIn);
    const focusInitial = () => {
      const list = items();
      const target = list.find((item) => item.getAttribute('aria-checked') === 'true') ?? list[0];
      target?.focus();
      if (target && document.activeElement !== target && frame++ < 30) {
        raf = requestAnimationFrame(focusInitial);
      }
    };
    focusInitial();
    // On the document, not the popover: until the first item takes focus the
    // Modal's focus trap parks it on the scrim, outside the popover.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        event.preventDefault();
        dismiss();
        return;
      }
      const list = items();
      const next = nextMenuIndex(
        event.key,
        list.indexOf(document.activeElement as HTMLElement),
        list.length,
      );
      if (next === null) return;
      event.preventDefault();
      list[next]?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      popover.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [popover]);
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
  const reduceMotion = useReducedMotion();
  // State, not a ref: the Modal mounts its content a render after `visible`
  // flips, and the keyboard hook has to run once the popover exists.
  const [popover, setPopover] = useState<HTMLElement | null>(null);
  useWebMenuKeyboard(popover, onDismiss);

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
        animationType={reduceMotion ? 'none' : 'fade'}
        onRequestClose={onDismiss}
        aria-label="Menu"
      >
        {/* Scrim and wrapper are not controls: see AppDialog. */}
        <Pressable
          accessible={false}
          tabIndex={-1}
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
              // On web the host node is the popover's DOM element.
              ref={Platform.OS === 'web' ? (setPopover as unknown as React.Ref<View>) : undefined}
              // Not accessible: a focusable group would hide the items from VoiceOver.
              // The role still reaches the DOM on web; the Modal carries the name.
              accessible={false}
              tabIndex={-1}
              testID="menu-popover"
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
      pressed && { backgroundColor: theme.colors.muted },
    ],
    [theme.colors.muted],
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

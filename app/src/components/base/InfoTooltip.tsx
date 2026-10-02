// NOTE: hand-rolled on purpose; carries the mobile-web full-screen modal variant.
import { type JSX, useCallback, useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { MIN_TAP_TARGET, WEB_FOCUS_RING } from '@/constants';
import { useModalPresence } from '@/hooks/useModalPresence';
import { useAppTheme } from '@/theme/appThemeContext';
import { useInverseSurface } from '@/theme/inverseSurface';
import { cn } from '@/utils/cn';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { OverlaySurface } from './OverlaySurface';
import { PRESS_TINT } from './pressFeedback';

const MOBILE_USER_AGENT_PATTERN = /iPhone|iPad|iPod|Android/i;

const getIsMobileWeb = () =>
  Platform.OS === 'web' &&
  typeof navigator !== 'undefined' &&
  MOBILE_USER_AGENT_PATTERN.test(navigator.userAgent);

export const InfoTooltip = ({ title }: { title: string }): JSX.Element => {
  const theme = useAppTheme();
  const inverse = useInverseSurface();
  const [visible, setVisible] = useState(false);
  const { mounted, fadeStyle } = useModalPresence(visible);
  const show = useCallback(() => setVisible(true), []);
  const hide = useCallback(() => setVisible(false), []);
  // Both variants float over content, so they take the single overlay tier.
  const tooltipShadowStyle = theme.tokens.elevation.overlay;

  const toggle = useCallback(() => setVisible((v) => !v), []);
  // Escape closes the bubble on web (WCAG 1.4.13).
  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setVisible(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [visible]);

  if (getIsMobileWeb()) {
    return (
      <View>
        <Pressable
          onPress={show}
          className={cn('rounded-md p-2', PRESS_TINT, WEB_FOCUS_RING)}
          testID="info-pressable"
          accessibilityRole="button"
          accessibilityLabel={`Info: ${title}`}
          // hitSlop is invisible to the DOM on web, so the box itself carries the 44 floor.
          hitSlop={4}
          style={styles.tapFloor}
        >
          {/* Icon doesn't forward testID (Lucide maps it to a data-testid attribute
              RNTL can't query), so the test target wraps the glyph instead. */}
          <View testID="info-icon">
            <Icon name="info" size="md" color={theme.colors.mutedForeground} />
          </View>
        </Pressable>

        <Modal visible={mounted} transparent animationType="none" onRequestClose={hide}>
          <Animated.View
            style={[StyleSheet.absoluteFill, fadeStyle]}
            pointerEvents={visible ? 'auto' : 'none'}
          >
            {/* Scrim is a sibling of the text, not its parent: a button would swallow the
              tooltip into one "Dismiss" control. Not a control itself (see AppDialog). */}
            <Pressable
              accessible={false}
              tabIndex={-1}
              testID="tooltip-scrim"
              style={[StyleSheet.absoluteFill, { backgroundColor: theme.tokens.overlay.scrim }]}
              onPress={hide}
            />
            <View className="flex-1 items-center justify-center" pointerEvents="box-none">
              <OverlaySurface
                className="py-3 px-4"
                style={[
                  styles.tooltip,
                  tooltipShadowStyle,
                  { backgroundColor: inverse.background },
                ]}
                tone="scrim"
              >
                <AppText variant="body" style={{ color: inverse.foreground }}>
                  {title}
                </AppText>
              </OverlaySurface>
            </View>
          </Animated.View>
        </Modal>
      </View>
    );
  }

  // Native + desktop web: a bubble under the icon on press (native) or hover (web).
  // On web the hover already opened it, so a click must not toggle it shut again;
  // Escape, blur and hover-out close it there. The hover target is the wrapper,
  // which holds icon and bubble edge to edge, so the pointer can move onto the
  // bubble without closing it (WCAG 1.4.13).
  const isWeb = Platform.OS === 'web';
  return (
    <View
      className="self-start"
      testID="info-hover-area"
      onPointerEnter={isWeb ? show : undefined}
      onPointerLeave={isWeb ? hide : undefined}
    >
      <Pressable
        onPress={isWeb ? show : toggle}
        onBlur={hide}
        className={cn('rounded-md p-2', PRESS_TINT, WEB_FOCUS_RING)}
        accessibilityRole="button"
        accessibilityLabel={`Info: ${title}`}
        // See above: the box carries the 44px floor; hitSlop is native-only.
        hitSlop={4}
        style={styles.tapFloor}
      >
        <View testID="info-icon">
          <Icon name="info" size="md" color={theme.colors.mutedForeground} />
        </View>
      </Pressable>
      {visible ? (
        <OverlaySurface
          // No top margin: a gap would sit outside the hover target.
          className="absolute left-0 z-10 px-2 py-1"
          style={[styles.floating, tooltipShadowStyle, { backgroundColor: inverse.background }]}
          tone="scrim"
        >
          <AppText
            variant="label"
            accessibilityLiveRegion="polite"
            numberOfLines={1}
            style={{ color: inverse.foreground }}
          >
            {title}
          </AppText>
        </OverlaySurface>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  tapFloor: {
    minWidth: MIN_TAP_TARGET,
    minHeight: MIN_TAP_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tooltip: {
    maxWidth: '80%',
    minWidth: 200,
  },
  floating: {
    top: '100%',
    maxWidth: 240,
  },
});

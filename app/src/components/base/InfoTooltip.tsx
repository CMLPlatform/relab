// NOTE (2026-08-05): assessed against the vendored `ui/tooltip` primitive and kept
// hand-rolled. That primitive portals through `@rn-primitives/tooltip`, and the app
// mounts no `PortalHost` — adopting it means new app-shell infrastructure — while
// still not covering the deliberate bits here: the 1.5s auto-dismiss and the
// full-screen modal variant for mobile web (where hover tooltips are unreachable).
import { type JSX, useCallback, useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useAppTheme } from '@/theme';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { OverlaySurface } from './OverlaySurface';

const MOBILE_USER_AGENT_PATTERN = /iPhone|iPad|iPod|Android/i;

const getIsMobileWeb = () =>
  Platform.OS === 'web' &&
  typeof navigator !== 'undefined' &&
  MOBILE_USER_AGENT_PATTERN.test(navigator.userAgent);

export const InfoTooltip = ({ title }: { title: string }): JSX.Element => {
  const theme = useAppTheme();
  const [visible, setVisible] = useState(false);
  const show = useCallback(() => setVisible(true), []);
  const hide = useCallback(() => setVisible(false), []);
  // Both variants float over content, so they take the single overlay tier.
  const tooltipShadowStyle = theme.tokens.elevation.overlay;

  // Settings
  const exitDelay = 1500; // milliseconds

  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => setVisible(false), exitDelay);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  if (getIsMobileWeb()) {
    return (
      <View>
        <Pressable
          onPress={show}
          className="p-2"
          testID="info-pressable"
          accessibilityRole="button"
          accessibilityLabel={`Info: ${title}`}
          // 20px glyph + spacing.sm padding (36px) + 4px hitSlop/side = 44px.
          hitSlop={4}
        >
          {/* Icon doesn't forward testID (Lucide maps it to a data-testid attribute
              RNTL can't query), so the test target wraps the glyph instead. */}
          <View testID="info-icon">
            <Icon name="information-outline" size="md" color={theme.colors.onSurfaceVariant} />
          </View>
        </Pressable>

        <Modal visible={visible} transparent animationType="fade" onRequestClose={hide}>
          <Pressable
            className="flex-1 items-center justify-center"
            style={{ backgroundColor: theme.tokens.overlay.scrim }}
            onPress={hide}
          >
            <OverlaySurface
              className="p-3 px-4"
              style={[
                styles.tooltip,
                tooltipShadowStyle,
                { backgroundColor: theme.colors.inverseSurface },
              ]}
              tone="scrim"
            >
              <AppText variant="plain" style={{ color: theme.colors.inverseOnSurface }}>
                {title}
              </AppText>
            </OverlaySurface>
          </Pressable>
        </Modal>
      </View>
    );
  }

  // Native app + desktop web: a small bubble anchored under the icon, shown on
  // press (native) or hover (web) — no portal needed since it's positioned
  // relative to its own wrapper rather than covering the full screen.
  return (
    <View className="self-start">
      <Pressable
        onPress={show}
        onHoverIn={Platform.OS === 'web' ? show : undefined}
        onHoverOut={Platform.OS === 'web' ? hide : undefined}
        className="p-2"
        accessibilityRole="button"
        accessibilityLabel={`Info: ${title}`}
        // 20px glyph + spacing.sm padding (36px) + 4px hitSlop/side = 44px.
        hitSlop={4}
      >
        <View testID="info-icon">
          <Icon name="information-outline" size="md" color={theme.colors.onSurfaceVariant} />
        </View>
      </Pressable>
      {visible ? (
        <OverlaySurface
          className="absolute left-0 z-10 mt-1 px-2 py-1"
          style={[
            styles.floating,
            tooltipShadowStyle,
            { backgroundColor: theme.colors.inverseSurface },
          ]}
          tone="scrim"
        >
          <AppText
            variant="plain"
            accessibilityLiveRegion="polite"
            numberOfLines={1}
            style={{ color: theme.colors.inverseOnSurface }}
          >
            {title}
          </AppText>
        </OverlaySurface>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  tooltip: {
    maxWidth: '80%',
    minWidth: 200,
  },
  floating: {
    top: '100%',
    maxWidth: 240,
  },
});

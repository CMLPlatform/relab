// NOTE (2026-08-05): assessed against the vendored `ui/tooltip` primitive and kept
// hand-rolled. That primitive portals through `@rn-primitives/tooltip`, and the app
// mounts no `PortalHost` — adopting it means new app-shell infrastructure — while
// still not covering the deliberate bits here: the 1.5s auto-dismiss and the
// full-screen modal variant for mobile web (where hover tooltips are unreachable).
import { type JSX, useCallback, useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { spacing } from '@/constants';
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
          style={styles.iconContainer}
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
            style={[styles.overlay, { backgroundColor: theme.tokens.overlay.scrim }]}
            onPress={hide}
          >
            <OverlaySurface
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
    <View style={styles.anchor}>
      <Pressable
        onPress={show}
        onHoverIn={Platform.OS === 'web' ? show : undefined}
        onHoverOut={Platform.OS === 'web' ? hide : undefined}
        style={styles.iconContainer}
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
  iconContainer: {
    padding: spacing.sm,
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tooltip: {
    padding: 12,
    paddingHorizontal: spacing.md,
    maxWidth: '80%',
    minWidth: 200,
  },
  anchor: {
    alignSelf: 'flex-start',
  },
  floating: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    maxWidth: 240,
    zIndex: 10,
  },
});

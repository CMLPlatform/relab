import { MaterialCommunityIcons } from '@expo/vector-icons';
import { type JSX, useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text, Tooltip } from 'react-native-paper';
import { OverlaySurface } from '@/components/common/OverlaySurface';
import { radius, spacing } from '@/constants/layout';
import { alpha, useAppTheme } from '@/theme';

const MOBILE_USER_AGENT_PATTERN = /iPhone|iPad|iPod|Android/i;

const getIsMobileWeb = () =>
  Platform.OS === 'web' &&
  typeof navigator !== 'undefined' &&
  MOBILE_USER_AGENT_PATTERN.test(navigator.userAgent);

export const InfoTooltip = ({ title }: { title: string }): JSX.Element => {
  const theme = useAppTheme();
  const [visible, setVisible] = useState(false);
  const tooltipShadowStyle = {
    boxShadow: `0px 2px 4px ${alpha(theme.colors.shadow, 0.25)}`,
  };

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
          onPress={() => setVisible(true)}
          style={styles.iconContainer}
          testID="info-pressable"
          accessibilityRole="button"
          accessibilityLabel={`Info: ${title}`}
        >
          <MaterialCommunityIcons
            name="information-outline"
            size={20}
            color={theme.colors.onSurfaceVariant}
            testID="info-icon"
          />
        </Pressable>

        <Modal
          visible={visible}
          transparent
          animationType="fade"
          onRequestClose={() => setVisible(false)}
        >
          <Pressable
            style={[styles.overlay, { backgroundColor: theme.tokens.overlay.scrim }]}
            onPress={() => setVisible(false)}
          >
            <OverlaySurface
              style={[
                styles.tooltip,
                tooltipShadowStyle,
                { backgroundColor: theme.colors.inverseSurface },
              ]}
              tone="scrim"
            >
              <Text variant="labelLarge" style={{ color: theme.colors.inverseOnSurface }}>
                {title}
              </Text>
            </OverlaySurface>
          </Pressable>
        </Modal>
      </View>
    );
  }

  return (
    <Tooltip title={title} enterTouchDelay={100} leaveTouchDelay={exitDelay}>
      <MaterialCommunityIcons
        name="information-outline"
        size={20}
        color={theme.colors.onSurfaceVariant}
        style={{ padding: 8 }}
        testID="info-icon"
      />
    </Tooltip>
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
    borderRadius: radius.md,
    maxWidth: '80%',
    minWidth: 200,
    elevation: 3,
  },
});

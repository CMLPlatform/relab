import { MaterialCommunityIcons } from '@expo/vector-icons';
import { JSX, useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text, Tooltip, useTheme } from 'react-native-paper';

const isMobileWeb =
  Platform.OS === 'web' && typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

export const InfoTooltip = ({ title }: { title: string }): JSX.Element => {
  const theme = useTheme();
  const [visible, setVisible] = useState(false);

  // Settings
  const exitDelay = 1500; // milliseconds

  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => setVisible(false), exitDelay);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  if (isMobileWeb) {
    return (
      <View>
        <Pressable onPress={() => setVisible(true)} style={styles.iconContainer}>
          <MaterialCommunityIcons name="information-outline" size={20} color={theme.colors.onSurfaceVariant} />
        </Pressable>

        <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
          <Pressable style={styles.overlay} onPress={() => setVisible(false)}>
            <View style={[styles.tooltip, { backgroundColor: theme.colors.inverseSurface }]}>
              <Text variant="labelLarge" style={{ color: theme.colors.inverseOnSurface }}>
                {title}
              </Text>
            </View>
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
      />
    </Tooltip>
  );
};

const styles = StyleSheet.create({
  iconContainer: {
    padding: 8,
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  tooltip: {
    padding: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    maxWidth: '80%',
    minWidth: 200,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});

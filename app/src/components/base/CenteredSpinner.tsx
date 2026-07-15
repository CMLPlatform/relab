import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAppTheme } from '@/theme';

/** Full-height centered loading spinner for screen-level pending states. */
export function CenteredSpinner() {
  const { colors } = useAppTheme();
  return (
    <View
      style={styles.center}
      accessible
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
    >
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
});

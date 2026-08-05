import { ActivityIndicator, View } from 'react-native';
import { useAppTheme } from '@/theme';

/** Full-height centered loading spinner for screen-level pending states. */
export function CenteredSpinner() {
  const { colors } = useAppTheme();
  return (
    <View
      className="flex-1 items-center justify-center p-6"
      accessible
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
    >
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

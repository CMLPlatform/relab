import { StyleSheet, View } from 'react-native';
import { useAppTheme } from '@/theme';
import { AppButton } from './AppButton';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

type Props = {
  message: string;
  onRetry: () => void;
  icon?: IconName;
};

/** Full-height centered error state with an icon, message, and retry button. */
export function ErrorState({ message, onRetry, icon = 'alert-circle-outline' }: Props) {
  const theme = useAppTheme();

  return (
    <View style={styles.center}>
      <Icon name={icon} size={48} color={theme.colors.error} />
      <Text style={styles.message}>{message}</Text>
      <AppButton variant="primary" onPress={onRetry} className="mt-4">
        Retry
      </AppButton>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  message: {
    marginTop: 12,
    textAlign: 'center',
  },
});

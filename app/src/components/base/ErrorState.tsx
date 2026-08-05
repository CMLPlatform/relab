import { View } from 'react-native';
import { useAppTheme } from '@/theme';
import { AppButton } from './AppButton';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

type Props = {
  message: string;
  onRetry: () => void;
  icon?: IconName;
};

/** Full-height centered error state with an icon, message, and retry button. */
export function ErrorState({ message, onRetry, icon = 'alert-circle-outline' }: Props) {
  const theme = useAppTheme();

  return (
    <View className="flex-1 items-center justify-center gap-3 p-6">
      <Icon name={icon} size={48} color={theme.colors.error} />
      <AppText className="mt-3 text-center">{message}</AppText>
      <AppButton variant="primary" onPress={onRetry} className="mt-4">
        Retry
      </AppButton>
    </View>
  );
}

import { View } from 'react-native';
import { useAppTheme } from '@/theme';
import { AppButton } from './AppButton';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

type Props = {
  message: string;
  onRetry: () => void;
  icon?: IconName;
  title?: string;
  actionLabel?: string;
  iconColor?: string;
};

/** Full-height centered error state: icon, optional title, message, one action. */
export function ErrorState({
  message,
  onRetry,
  icon = 'circle-alert',
  title,
  actionLabel = 'Retry',
  iconColor,
}: Props) {
  const theme = useAppTheme();
  return (
    <View className="flex-1 items-center justify-center gap-3 p-6">
      <Icon name={icon} size={48} color={iconColor ?? theme.colors.error} />
      {title ? (
        <AppText variant="title" className="text-center">
          {title}
        </AppText>
      ) : null}
      <AppText className="text-center">{message}</AppText>
      <AppButton variant="primary" onPress={onRetry} className="mt-2">
        {actionLabel}
      </AppButton>
    </View>
  );
}

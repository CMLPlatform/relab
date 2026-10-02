import { View } from 'react-native';
import { useAppTheme } from '@/theme/appThemeContext';
import { AppButton } from './AppButton';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { IosAnnouncement } from './IosAnnouncement';

type Props = {
  message: string;
  onRetry: () => void;
  icon?: IconName;
  title?: string;
  actionLabel?: string;
  /** Names the action when the label alone is ambiguous on the page ("Retry loading products"). */
  actionAccessibilityLabel?: string;
  iconColor?: string;
  /** Hairline-top row inside a list or section, announced as it appears, instead of filling the screen. */
  compact?: boolean;
};

/**
 * The one error idiom: icon, title naming the problem, message naming the
 * recovery, one action. Full-height and centred by default; `compact` is the
 * inline variant for a failure inside otherwise loaded content.
 */
export function ErrorState({
  message,
  onRetry,
  icon = 'circle-alert',
  title,
  actionLabel = 'Retry',
  actionAccessibilityLabel,
  iconColor,
  compact = false,
}: Props) {
  const theme = useAppTheme();
  if (compact) {
    return (
      <View
        testID="error-state"
        accessibilityLiveRegion="polite"
        // A hairline-top row, not a card: it sits inside cards and expanded rows,
        // and a card in a card is a defect (DESIGN.md Layout).
        className="flex-row flex-wrap items-center gap-3 border-t border-border pt-3"
      >
        <IosAnnouncement text={title ? `${title}. ${message}` : message} />
        <Icon name={icon} size="lg" color={iconColor ?? theme.colors.error} />
        <View className="min-w-[160px] flex-1">
          {title ? <AppText className="font-semibold">{title}</AppText> : null}
          <AppText variant="caption">{message}</AppText>
        </View>
        <AppButton
          variant="outline"
          onPress={onRetry}
          accessibilityLabel={actionAccessibilityLabel}
        >
          {actionLabel}
        </AppButton>
      </View>
    );
  }
  return (
    <View className="flex-1 items-center justify-center gap-3 p-6">
      <Icon name={icon} size={48} color={iconColor ?? theme.colors.error} />
      {title ? (
        <AppText variant="title" className="text-center">
          {title}
        </AppText>
      ) : null}
      <AppText className="text-center">{message}</AppText>
      <AppButton
        variant="primary"
        onPress={onRetry}
        accessibilityLabel={actionAccessibilityLabel}
        className="mt-2"
      >
        {actionLabel}
      </AppButton>
    </View>
  );
}

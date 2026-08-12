import type { RefObject } from 'react';
import { Pressable, type TextStyle, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { Icon } from '@/components/base/Icon';
import { useAppTheme } from '@/theme';
import { palette } from '@/theme/palette.generated';

export type OAuthAccount = {
  account_email?: string | null;
};

type ProfileActionProps = {
  onPress: () => void;
  title: string;
  subtitle?: string;
  titleStyle?: TextStyle;
  hideChevron?: boolean;
  /** Return-focus target for the dialog `onPress` opens; see AppDialog's `triggerRef`. */
  triggerRef?: RefObject<View | null>;
};

/** A tappable settings row: title, optional subtitle, chevron. Rows within one Section. */
export function ProfileAction({
  onPress,
  title,
  subtitle,
  titleStyle,
  hideChevron = false,
  triggerRef,
}: ProfileActionProps) {
  const theme = useAppTheme();
  return (
    <Pressable
      ref={triggerRef}
      className="min-h-11 flex-row items-center justify-between px-4 py-2.5"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View className="flex-1">
        <AppText className="font-semibold" style={titleStyle}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText className="mt-px text-[13px] opacity-[0.55]">{subtitle}</AppText>
        ) : null}
      </View>
      {!hideChevron ? (
        <Icon name="chevron-right" size={26} color={palette[theme.scheme].mutedForeground} />
      ) : null}
    </Pressable>
  );
}

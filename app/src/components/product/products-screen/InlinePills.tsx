import { View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { Icon } from '@/components/base/Icon';
import { useAppTheme } from '@/theme';
import { palette } from '@/theme/palette.generated';
import { productsScreenStyles as styles } from './shared';

type NewProductPillProps = {
  label?: string;
};

export function NewProductPill({ label = 'New product' }: NewProductPillProps) {
  const theme = useAppTheme();

  // NOTE: plain emphasized text, not a pill: it names the control, it is not one.
  return (
    <AppText
      className="font-bold"
      style={[styles.inlineButtonText, { color: theme.colors.primary }]}
    >
      {label}
    </AppText>
  );
}

export function ProfilePill() {
  const theme = useAppTheme();
  // `primary` on the 12% tint measures 3.73:1 in dark at 14px bold (not WCAG
  // large text, so 4.5:1 applies); `primaryStrong` passes.
  const pillInk = palette[theme.scheme].primaryStrong;

  return (
    <View
      className="flex-row items-center gap-1 self-center rounded-full px-2 py-0.5"
      style={{ backgroundColor: theme.tokens.surface.accent }}
    >
      <Icon name="circle-user-round" size={14} color={pillInk} />
      <AppText
        testID="profile-pill-label"
        className="font-bold"
        style={[styles.inlineProfileText, { color: pillInk }]}
      >
        account
      </AppText>
    </View>
  );
}

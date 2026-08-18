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

  // NOTE: renders as plain emphasized text, not a pill shape — it names the
  // real "New product" control elsewhere on screen rather than acting as one,
  // so it shouldn't look tappable (design critique P3 #1).
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
  // `primary` on the 12% primary tint measures 3.73:1 in dark at 14px bold —
  // and 14px bold is not WCAG "large text" (that needs 18.66px bold), so 4.5:1
  // applies. `primaryStrong` is lighter in dark, which is the direction that
  // gains contrast against a dark tint; in light it is darker, same effect.
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

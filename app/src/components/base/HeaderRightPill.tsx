import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Pressable } from 'react-native';
import { MIN_TAP_TARGET, WEB_FOCUS_RING } from '@/constants';
import { useAuth } from '@/context/auth';
import { useAppTheme } from '@/theme/appThemeContext';
import { needsUsernameOnboarding } from '@/utils/router/onboarding';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { type PressState, pressFill } from './pressFeedback';

function truncateUsername(username: string) {
  return username.length > 16 ? `${username.slice(0, 14)}…` : username;
}

// backgroundColor/color stay inline: theme-dependent values with no CSS var.
const PILL_CLASS_NAME = `mr-4 flex-row items-center gap-1.5 rounded-md px-3 py-1.5 ${WEB_FOCUS_RING}`;

/** Tonal pill: the One Tint at rest, primary-strong with primary-foreground ink pressed and hovered. */
function Pill({
  label,
  accessibilityLabel,
  withIcon,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  withIcon: boolean;
  onPress: () => void;
}) {
  const theme = useAppTheme();
  // minHeight, not just hitSlop: hitSlop is invisible to the DOM on web.
  const pillStyle = useCallback(
    (state: PressState) => [
      { backgroundColor: theme.tokens.surface.accent, minHeight: MIN_TAP_TARGET },
      pressFill(state, theme.colors.primaryStrong),
    ],
    [theme],
  );
  return (
    <Pressable
      onPress={onPress}
      className={PILL_CLASS_NAME}
      style={pillStyle}
      // ~32px pill + 6px hitSlop/side = 44px tap target (a11y floor).
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {(state: PressState) => {
        const ink = state.pressed || state.hovered ? theme.colors.onPrimary : theme.colors.primary;
        return (
          <>
            {withIcon ? <Icon name="circle-user-round" size={18} color={ink} /> : null}
            <AppText
              variant="caption"
              className="font-semibold"
              style={{ color: ink }}
              numberOfLines={1}
            >
              {label}
            </AppText>
          </>
        );
      }}
    </Pressable>
  );
}

export function HeaderRightPill() {
  const { user } = useAuth();
  const router = useRouter();
  const needsOnboarding = user ? needsUsernameOnboarding(user) : false;

  const goToAccount = useCallback(() => {
    // navigate(): /account is a tab, and this pill also renders on the public
    // profile screen outside the tabs, where a push would stack a second (tabs).
    router.navigate(needsOnboarding ? '/onboarding' : '/account');
  }, [router, needsOnboarding]);
  const goToLogin = useCallback(() => router.push('/login'), [router]);

  if (user) {
    const username = needsOnboarding ? 'Complete profile' : truncateUsername(user.username ?? '');
    return (
      <Pill
        label={username}
        accessibilityLabel={needsOnboarding ? 'Complete profile' : `Account: ${username}`}
        withIcon
        onPress={goToAccount}
      />
    );
  }

  return <Pill label="Sign in" accessibilityLabel="Sign in" withIcon={false} onPress={goToLogin} />;
}

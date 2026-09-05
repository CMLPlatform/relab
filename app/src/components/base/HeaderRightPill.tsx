import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Pressable } from 'react-native';
import { MIN_TAP_TARGET } from '@/constants';
import { useAuth } from '@/context/auth';
import { useAppTheme } from '@/theme';
import { needsUsernameOnboarding } from '@/utils/router/onboarding';
import { AppText } from './AppText';
import { Icon } from './Icon';

function truncateUsername(username: string) {
  return username.length > 16 ? `${username.slice(0, 14)}…` : username;
}

// Pill classes: layout/spacing/radius moved to className (exact Tailwind
// steps with inlineRem: 16 — rounded-[6px] matches radius.control).
// backgroundColor/color stay inline: theme-dependent values with no CSS var.
const PILL_CLASS_NAME = 'mr-4 flex-row items-center gap-1.5 rounded-[6px] px-3 py-1.5';
const PILL_TEXT_CLASS_NAME = 'text-[14px] font-semibold';

export function HeaderRightPill() {
  const { user } = useAuth();
  const router = useRouter();
  const theme = useAppTheme();
  const needsOnboarding = user ? needsUsernameOnboarding(user) : false;
  // Interactive header control — primary family, never the neutral glass
  // (DESIGN.md: primary blue carries all interaction). tokens.surface.accent
  // is the canonical tinted fill (primary at 12% opacity); *Container roles
  // are retired.
  // minHeight, not just hitSlop: hitSlop expands the target on native but is
  // invisible to the DOM on web, where this measured 83x30.
  const pillStyle = { backgroundColor: theme.tokens.surface.accent, minHeight: MIN_TAP_TARGET };
  const primaryTextStyle = { color: theme.colors.primary };

  const goToAccount = useCallback(() => {
    // navigate(): /account is a tab, and this pill also renders on the public
    // profile screen outside the tabs, where a push would stack a second (tabs).
    router.navigate(needsOnboarding ? '/onboarding' : '/account');
  }, [router, needsOnboarding]);
  const goToLogin = useCallback(() => router.push('/login'), [router]);

  if (user) {
    const username = needsOnboarding ? 'Complete profile' : truncateUsername(user.username ?? '');
    return (
      <Pressable
        onPress={goToAccount}
        className={PILL_CLASS_NAME}
        style={pillStyle}
        // ~32px pill + 6px hitSlop/side = 44px tap target (a11y floor).
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={needsOnboarding ? 'Complete profile' : `Account: ${username}`}
      >
        {/* tokens.surface.accent is a light primary tint, not a solid
         *Container fill — onPrimaryContainer here was a contrast bug. */}
        <Icon name="circle-user-round" size={18} color={theme.colors.primary} />
        <AppText
          variant="label"
          className={PILL_TEXT_CLASS_NAME}
          style={primaryTextStyle}
          numberOfLines={1}
        >
          {username}
        </AppText>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={goToLogin}
      className={PILL_CLASS_NAME}
      style={pillStyle}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel="Sign in"
    >
      <AppText variant="label" className={PILL_TEXT_CLASS_NAME} style={primaryTextStyle}>
        Sign in
      </AppText>
    </Pressable>
  );
}

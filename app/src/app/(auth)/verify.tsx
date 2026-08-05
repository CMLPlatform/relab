import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AuthCard } from '@/components/auth/AuthCardSections';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { useVerifyEmail } from '@/features/auth/useVerifyEmail';
import { useAppTheme } from '@/theme';

export default function VerifyEmailScreen() {
  const theme = useAppTheme();
  const { isLoading, error, success, isLoggedIn, goToLogin, goHome } = useVerifyEmail();

  return (
    <AuthScreen>
      <AuthCard title="Verify email" contentStyle={styles.cardContent}>
        {isLoading ? (
          <View style={styles.centeredState}>
            <ActivityIndicator size="large" />
            <AppText variant="body">Verifying your email…</AppText>
          </View>
        ) : null}

        {error && !isLoading && (
          <View style={styles.centeredState}>
            <AppText variant="body" style={{ color: theme.colors.error, textAlign: 'center' }}>
              {error}
            </AppText>
            <AppButton variant="primary" onPress={goHome}>
              Back to home
            </AppButton>
          </View>
        )}

        {success && !isLoading && (
          <View style={styles.centeredState}>
            <AppText variant="body" style={{ color: theme.colors.primary, textAlign: 'center' }}>
              Email verified!
            </AppText>
            {isLoggedIn ? (
              <AppText variant="body">Taking you to your products…</AppText>
            ) : (
              <>
                <AppText variant="body" style={{ textAlign: 'center' }}>
                  If you signed up in the app, you're still signed in there — just head back.
                </AppText>
                <AppButton variant="primary" onPress={goToLogin}>
                  Sign in here
                </AppButton>
              </>
            )}
          </View>
        )}
      </AuthCard>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  cardContent: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  centeredState: {
    gap: 12,
    alignItems: 'center',
  },
});

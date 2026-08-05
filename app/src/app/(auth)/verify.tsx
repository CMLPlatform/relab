import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AuthCard } from '@/components/auth/AuthCardSections';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { useVerifyEmail } from '@/features/auth/useVerifyEmail';

export default function VerifyEmailScreen() {
  const { isLoading, error, success, isLoggedIn, goToLogin, goHome } = useVerifyEmail();

  return (
    <AuthScreen>
      <AuthCard title="Verify email" contentStyle={styles.cardContent}>
        {isLoading ? (
          <View className="gap-3 items-center">
            <ActivityIndicator size="large" />
            <AppText variant="body">Verifying your email…</AppText>
          </View>
        ) : null}

        {error && !isLoading && (
          <View className="gap-3 items-center">
            <AppText variant="body" className="text-destructive text-center">
              {error}
            </AppText>
            <AppButton variant="primary" onPress={goHome}>
              Back to home
            </AppButton>
          </View>
        )}

        {success && !isLoading && (
          <View className="gap-3 items-center">
            <AppText variant="body" className="text-primary text-center">
              Email verified!
            </AppText>
            {isLoggedIn ? (
              <AppText variant="body">Taking you to your products…</AppText>
            ) : (
              <>
                <AppText variant="body" className="text-center">
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
});

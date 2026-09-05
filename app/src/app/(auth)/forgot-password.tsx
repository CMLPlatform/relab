import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { View } from 'react-native';
import { AuthBackToLoginAction, AuthCard, AuthFormError } from '@/components/auth/AuthCardSections';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { ControlledTextField } from '@/components/base/ControlledTextField';
import { useForgotPassword } from '@/features/auth/usePasswordReset';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { control, isValid, isSubmitting, success, error, submit } = useForgotPassword();
  const goToLogin = useCallback(() => router.replace('/login'), [router]);

  return (
    <AuthScreen>
      <AuthCard title="Forgot password">
        {success ? (
          <View className="gap-3 items-center py-4">
            <AppText variant="body" className="text-primary text-center">
              If an account exists with this email, we&apos;ve sent it a password reset link.
            </AppText>
            <AppButton variant="primary" onPress={goToLogin}>
              Back to login
            </AppButton>
          </View>
        ) : (
          <>
            <AppText variant="body">
              Enter your email address and we&apos;ll send you instructions to reset your password.
            </AppText>

            <ControlledTextField
              control={control}
              name="email"
              label="Email"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              editable={!isSubmitting}
              placeholder="e.g. you@university.edu"
              accessibilityLabel="Email"
            />

            <AuthFormError message={error} />

            <AppButton
              variant="primary"
              onPress={submit}
              loading={isSubmitting}
              disabled={isSubmitting || !isValid}
            >
              Send reset link
            </AppButton>

            <AuthBackToLoginAction onPress={goToLogin} />
          </>
        )}
      </AuthCard>
    </AuthScreen>
  );
}

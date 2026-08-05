import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Controller } from 'react-hook-form';
import { View } from 'react-native';
import { AuthBackToLoginAction, AuthCard, AuthFormError } from '@/components/auth/AuthCardSections';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { TextInput } from '@/components/base/TextInput';
import { useForgotPassword } from '@/features/auth/usePasswordReset';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { control, fieldError, isValid, isSubmitting, success, error, submit } =
    useForgotPassword();
  const goToLogin = useCallback(() => router.replace('/login'), [router]);
  const renderEmail = useCallback(
    ({
      field: { onChange, value },
    }: {
      field: { onChange: (text: string) => void; value: string };
    }) => (
      <View className="gap-1">
        <AppText variant="label">Email</AppText>
        <TextInput
          value={value}
          onChangeText={onChange}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          editable={!isSubmitting}
          placeholder="e.g. you@university.edu"
          accessibilityLabel="Email"
          bordered
        />
      </View>
    ),
    [isSubmitting],
  );

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

            <Controller control={control} name="email" render={renderEmail} />

            <AuthFormError message={error ?? fieldError} />

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

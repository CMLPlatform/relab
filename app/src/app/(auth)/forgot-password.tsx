import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Controller } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { Card } from '@/components/base/Card';
import { TextInput } from '@/components/base/TextInput';
import { useForgotPassword } from '@/features/auth/usePasswordReset';
import { useAppTheme } from '@/theme';

export default function ForgotPasswordScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const { control, fieldError, isValid, isSubmitting, success, error, submit } =
    useForgotPassword();
  const goToLogin = () => router.push('/login');
  const goBack = useCallback(() => router.back(), [router]);
  const renderEmail = useCallback(
    ({
      field: { onChange, value },
    }: {
      field: { onChange: (text: string) => void; value: string };
    }) => (
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        editable={!isSubmitting}
        placeholder="Email"
        accessibilityLabel="Email"
        style={[styles.input, { borderColor: theme.colors.outline }]}
      />
    ),
    [isSubmitting, theme.colors.outline],
  );

  return (
    <View style={styles.screen}>
      <Card>
        <View style={styles.cardContent}>
          <AppText variant="display">Forgot password</AppText>

          {success ? (
            <View style={styles.successContainer}>
              <AppText variant="body" style={{ color: theme.colors.primary, textAlign: 'center' }}>
                If an account exists with this email, we&apos;ve sent it a password reset link.
              </AppText>
              <AppButton variant="primary" onPress={goToLogin}>
                Back to login
              </AppButton>
            </View>
          ) : (
            <>
              <AppText variant="body">
                Enter your email address and we&apos;ll send you instructions to reset your
                password.
              </AppText>

              <Controller control={control} name="email" render={renderEmail} />

              {error || fieldError ? (
                <AppText style={{ color: theme.tokens.status.danger }}>
                  {error ?? fieldError}
                </AppText>
              ) : null}

              <AppButton
                variant="primary"
                onPress={submit}
                loading={isSubmitting}
                disabled={isSubmitting || !isValid}
              >
                Send reset link
              </AppButton>

              <View style={styles.actions}>
                <AppButton variant="ghost" onPress={goBack}>
                  Back to login
                </AppButton>
              </View>
            </>
          )}
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  cardContent: {
    padding: 16,
    gap: 16,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  successContainer: {
    gap: 12,
    alignItems: 'center',
    paddingVertical: 16,
  },
  actions: {
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'center',
    marginTop: 8,
  },
});

import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Controller } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { Button, Card, HelperText, Text, TextInput } from 'react-native-paper';
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
        label="Email"
        value={value}
        onChangeText={onChange}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        disabled={isSubmitting}
      />
    ),
    [isSubmitting],
  );

  return (
    <View style={styles.screen}>
      <Card>
        <Card.Content style={styles.cardContent}>
          <Text variant="headlineMedium">Forgot password</Text>

          {success ? (
            <View style={styles.successContainer}>
              <Text
                variant="bodyLarge"
                style={{ color: theme.colors.primary, textAlign: 'center' }}
              >
                If an account exists with this email, we&apos;ve sent it a password reset link.
              </Text>
              <Button mode="contained" onPress={goToLogin}>
                Back to login
              </Button>
            </View>
          ) : (
            <>
              <Text variant="bodyMedium">
                Enter your email address and we&apos;ll send you instructions to reset your
                password.
              </Text>

              <Controller control={control} name="email" render={renderEmail} />

              {error || fieldError ? (
                <HelperText type="error" visible>
                  {error ?? fieldError}
                </HelperText>
              ) : null}

              <Button
                mode="contained"
                onPress={submit}
                loading={isSubmitting}
                disabled={isSubmitting || !isValid}
              >
                Send reset link
              </Button>

              <View style={styles.actions}>
                <Button mode="text" onPress={goBack}>
                  Back to login
                </Button>
              </View>
            </>
          )}
        </Card.Content>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  cardContent: {
    gap: 16,
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

import { useRouter } from 'expo-router';
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

  return (
    <View style={styles.screen}>
      <Card>
        <Card.Content style={styles.cardContent}>
          <Text variant="headlineMedium">Forgot Password</Text>

          {success ? (
            <View style={styles.successContainer}>
              <Text
                variant="bodyLarge"
                style={{ color: theme.colors.primary, textAlign: 'center' }}
              >
                If an account exists with this email, you will receive password reset instructions.
              </Text>
              <Button mode="contained" onPress={goToLogin}>
                Back to Login
              </Button>
            </View>
          ) : (
            <>
              <Text variant="bodyMedium">
                Enter your email address and we&apos;ll send you instructions to reset your
                password.
              </Text>

              <Controller
                control={control}
                name="email"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    label="Email"
                    value={value}
                    onChangeText={onChange}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    disabled={isSubmitting}
                  />
                )}
              />

              {(error || fieldError) && (
                <HelperText type="error" visible>
                  {error ?? fieldError}
                </HelperText>
              )}

              <Button
                mode="contained"
                onPress={submit}
                loading={isSubmitting}
                disabled={isSubmitting || !isValid}
              >
                Send Reset Link
              </Button>

              <View style={styles.actions}>
                <Button mode="text" onPress={() => router.back()}>
                  Back to Login
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

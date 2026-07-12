import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Controller } from 'react-hook-form';
import { View } from 'react-native';
import { Button, Card, HelperText, Text, TextInput } from 'react-native-paper';
import { useResetPassword } from '@/features/auth/usePasswordReset';
import { useSensitiveAuthToken } from '@/features/auth/useSensitiveAuthToken';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { token: tokenParam } = useLocalSearchParams<{ token: string }>();
  const token = useSensitiveAuthToken(typeof tokenParam === 'string' ? tokenParam : undefined);
  const { control, fieldError, isValid, isSubmitting, success, error, submit } =
    useResetPassword(token);
  const [showPassword, setShowPassword] = useState(false);
  const toggleShowPassword = useCallback(() => setShowPassword((s) => !s), []);
  const goToLogin = useCallback(() => router.push('/login'), [router]);
  const renderPassword = useCallback(
    ({
      field: { onChange, value },
    }: {
      field: { onChange: (text: string) => void; value: string };
    }) => (
      <TextInput
        label="New password"
        testID="password-input"
        value={value}
        onChangeText={onChange}
        secureTextEntry={!showPassword}
        autoCapitalize="none"
        autoComplete="password-new"
        textContentType="newPassword"
        disabled={isSubmitting}
        right={
          <TextInput.Icon icon={showPassword ? 'eye-off' : 'eye'} onPress={toggleShowPassword} />
        }
      />
    ),
    [showPassword, isSubmitting, toggleShowPassword],
  );
  const renderConfirmPassword = useCallback(
    ({
      field: { onChange, value },
    }: {
      field: { onChange: (text: string) => void; value: string };
    }) => (
      <TextInput
        label="Confirm new password"
        testID="confirm-password-input"
        value={value}
        onChangeText={onChange}
        secureTextEntry={!showPassword}
        autoCapitalize="none"
        autoComplete="password-new"
        textContentType="newPassword"
        disabled={isSubmitting}
      />
    ),
    [showPassword, isSubmitting],
  );

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 16 }}>
      <Card>
        <Card.Content style={{ gap: 16 }}>
          <Text variant="headlineMedium">Reset password</Text>

          {success ? (
            <View style={{ gap: 12, alignItems: 'center', paddingVertical: 16 }}>
              <Text variant="bodyLarge" style={{ textAlign: 'center' }}>
                Password reset. You can now sign in.
              </Text>
              <Text variant="bodyMedium">Redirecting to login…</Text>
            </View>
          ) : (
            <>
              <Controller control={control} name="password" render={renderPassword} />

              <Controller control={control} name="confirmPassword" render={renderConfirmPassword} />

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
                Reset password
              </Button>

              <View
                style={{ flexDirection: 'row', gap: 16, justifyContent: 'center', marginTop: 8 }}
              >
                <Button mode="text" onPress={goToLogin}>
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

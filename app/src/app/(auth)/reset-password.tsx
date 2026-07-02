import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
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

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 16 }}>
      <Card>
        <Card.Content style={{ gap: 16 }}>
          <Text variant="headlineMedium">Reset Password</Text>

          {success ? (
            <View style={{ gap: 12, alignItems: 'center', paddingVertical: 16 }}>
              <Text variant="bodyLarge" style={{ textAlign: 'center' }}>
                Password reset successful! You can now login on the app.
              </Text>
              <Text variant="bodyMedium">Redirecting to login...</Text>
            </View>
          ) : (
            <>
              <Controller
                control={control}
                name="password"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    label="New Password"
                    testID="password-input"
                    value={value}
                    onChangeText={onChange}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoComplete="password-new"
                    textContentType="newPassword"
                    disabled={isSubmitting}
                    right={
                      <TextInput.Icon
                        icon={showPassword ? 'eye-off' : 'eye'}
                        onPress={() => setShowPassword(!showPassword)}
                      />
                    }
                  />
                )}
              />

              <Controller
                control={control}
                name="confirmPassword"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    label="Confirm New Password"
                    testID="confirm-password-input"
                    value={value}
                    onChangeText={onChange}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoComplete="password-new"
                    textContentType="newPassword"
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
                Reset Password
              </Button>

              <View
                style={{ flexDirection: 'row', gap: 16, justifyContent: 'center', marginTop: 8 }}
              >
                <Button mode="text" onPress={() => router.push('/login')}>
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

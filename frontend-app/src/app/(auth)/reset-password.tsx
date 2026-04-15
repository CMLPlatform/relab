import { zodResolver } from '@hookform/resolvers/zod';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Platform, View } from 'react-native';
import { Button, Card, HelperText, Text, TextInput } from 'react-native-paper';
import { API_URL } from '@/config';
import { apiFetch } from '@/services/api/client';
import {
  type ResetPasswordFormValues,
  resetPasswordSchema,
} from '@/services/api/validation/userSchema';
import { logError } from '@/utils/logging';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { token: tokenParam } = useLocalSearchParams<{ token: string }>();

  // Capture the token from the URL into a ref immediately, then strip it from
  // the address bar so it doesn't persist in browser history.
  const tokenRef = useRef(tokenParam);
  useEffect(() => {
    if (tokenParam && Platform.OS === 'web' && typeof window !== 'undefined') {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [tokenParam]);

  const {
    control,
    handleSubmit,
    formState: { errors, isValid, isSubmitting },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    mode: 'onChange',
    defaultValues: { password: '' },
  });

  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        router.push('/login');
      }, 3000);

      if (timer && typeof timer === 'object' && 'unref' in timer) {
        (timer as { unref(): void }).unref();
      }

      return () => clearTimeout(timer);
    }
  }, [success, router]);
  const [showPassword, setShowPassword] = useState(false);

  const handleResetPassword = handleSubmit(async (data: ResetPasswordFormValues) => {
    const token = tokenRef.current;
    if (!token) {
      setError('No reset token provided');
      return;
    }

    setError(null);

    try {
      const response = await apiFetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: data.password }),
      });

      if (response.ok) {
        setSuccess(true);
        setError(null);
      } else {
        const data = await response.json();
        setError(data.detail || 'Password reset failed');
      }
    } catch (err) {
      logError('Password reset error:', err);
      setError('An error occurred during password reset');
    }
  });

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 16 }}>
      <Card>
        <Card.Content style={{ gap: 16 }}>
          <Text variant="headlineMedium">Reset Password</Text>

          {!success ? (
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

              {error && (
                <HelperText type="error" visible={!!error}>
                  {error}
                </HelperText>
              )}

              {!error && errors.password && (
                <HelperText type="error" visible>
                  {errors.password.message}
                </HelperText>
              )}

              <Button
                mode="contained"
                onPress={handleResetPassword}
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
          ) : (
            <View style={{ gap: 12, alignItems: 'center', paddingVertical: 16 }}>
              <Text variant="bodyLarge" style={{ textAlign: 'center' }}>
                Password reset successful! You can now login on the app.
              </Text>
              <Text variant="bodyMedium">Redirecting to login...</Text>
            </View>
          )}
        </Card.Content>
      </Card>
    </View>
  );
}

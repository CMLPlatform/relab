import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';
import { Button, Card, HelperText, Text, TextInput, useTheme } from 'react-native-paper';
import { API_URL } from '@/config';
import { apiFetch } from '@/services/api/client';
import {
  type ForgotPasswordFormValues,
  forgotPasswordSchema,
} from '@/services/api/validation/userSchema';
import { logError } from '@/utils/logging';

export default function ForgotPasswordScreen() {
  const theme = useTheme();
  const router = useRouter();

  const {
    control,
    handleSubmit,
    formState: { errors, isValid, isSubmitting },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    mode: 'onChange',
    defaultValues: { email: '' },
  });

  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        router.replace('/login');
      }, 5000);

      if (timer && typeof timer === 'object' && 'unref' in timer) {
        (timer as { unref(): void }).unref();
      }

      return () => clearTimeout(timer);
    }
  }, [success, router]);

  const handleForgotPassword = handleSubmit(async (data: ForgotPasswordFormValues) => {
    setError(null);

    try {
      const response = await apiFetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.email }),
      });

      if (response.ok) {
        setSuccess(true);
        setError(null);
      } else {
        const data = await response.json();
        setError(data.detail || 'Failed to send reset email');
      }
    } catch (err) {
      logError('Forgot password error:', err);
      setError('An error occurred. Please try again later.');
    }
  });

  return (
    <View style={{ flex: 1 }}>
      <Card>
        <Card.Content style={{ gap: 16 }}>
          <Text variant="headlineMedium">Forgot Password</Text>

          {!success ? (
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

              {error && (
                <HelperText type="error" visible={!!error}>
                  {error}
                </HelperText>
              )}

              {!error && errors.email && (
                <HelperText type="error" visible>
                  {errors.email.message}
                </HelperText>
              )}

              <Button
                mode="contained"
                onPress={handleForgotPassword}
                loading={isSubmitting}
                disabled={isSubmitting || !isValid}
              >
                Send Reset Link
              </Button>

              <View
                style={{ flexDirection: 'row', gap: 16, justifyContent: 'center', marginTop: 8 }}
              >
                <Button mode="text" onPress={() => router.back()}>
                  Back to Login
                </Button>
              </View>
            </>
          ) : (
            <View style={{ gap: 12, alignItems: 'center', paddingVertical: 16 }}>
              <Text
                variant="bodyLarge"
                style={{ color: theme.colors.primary, textAlign: 'center' }}
              >
                If an account exists with this email, you will receive password reset instructions.
              </Text>
              <Button mode="contained" onPress={() => router.push('/login')}>
                Back to Login
              </Button>
            </View>
          )}
        </Card.Content>
      </Card>
    </View>
  );
}

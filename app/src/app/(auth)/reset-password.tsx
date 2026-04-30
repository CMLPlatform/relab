import { zodResolver } from '@hookform/resolvers/zod';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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

type TimerWithUnref = ReturnType<typeof setTimeout> & { unref(): void };

function unrefTimer(timer: ReturnType<typeof setTimeout>) {
  if (timer && typeof timer === 'object' && 'unref' in timer) {
    (timer as TimerWithUnref).unref();
  }
}

function ResetPasswordSuccess() {
  return (
    <View style={{ gap: 12, alignItems: 'center', paddingVertical: 16 }}>
      <Text variant="bodyLarge" style={{ textAlign: 'center' }}>
        Password reset successful! You can now login on the app.
      </Text>
      <Text variant="bodyMedium">Redirecting to login...</Text>
    </View>
  );
}

function ResetPasswordForm({
  control,
  showPassword,
  setShowPassword,
  isSubmitting,
  error,
  passwordError,
  isValid,
  onSubmit,
  onBackToLogin,
}: {
  control: ReturnType<typeof useForm<ResetPasswordFormValues>>['control'];
  showPassword: boolean;
  setShowPassword: (value: boolean) => void;
  isSubmitting: boolean;
  error: string | null;
  passwordError?: string;
  isValid: boolean;
  onSubmit: () => void;
  onBackToLogin: () => void;
}) {
  return (
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
        <HelperText type="error" visible={Boolean(error)}>
          {error}
        </HelperText>
      )}

      {!error && passwordError && (
        <HelperText type="error" visible>
          {passwordError}
        </HelperText>
      )}

      <Button
        mode="contained"
        onPress={onSubmit}
        loading={isSubmitting}
        disabled={isSubmitting || !isValid}
      >
        Reset Password
      </Button>

      <View style={{ flexDirection: 'row', gap: 16, justifyContent: 'center', marginTop: 8 }}>
        <Button mode="text" onPress={onBackToLogin}>
          Back to Login
        </Button>
      </View>
    </>
  );
}

function useResetPasswordFormState() {
  return useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    mode: 'onChange',
    defaultValues: { password: '' },
  });
}

function useResetPasswordRedirect(success: boolean, router: ReturnType<typeof useRouter>) {
  useEffect(() => {
    if (!success) return;

    const timer = setTimeout(() => {
      router.push('/login');
    }, 3000);
    unrefTimer(timer);

    return () => clearTimeout(timer);
  }, [success, router]);
}

function ResetPasswordCardContent({
  success,
  control,
  showPassword,
  setShowPassword,
  isSubmitting,
  error,
  passwordError,
  isValid,
  onSubmit,
  onBackToLogin,
}: {
  success: boolean;
  control: ReturnType<typeof useForm<ResetPasswordFormValues>>['control'];
  showPassword: boolean;
  setShowPassword: (value: boolean) => void;
  isSubmitting: boolean;
  error: string | null;
  passwordError?: string;
  isValid: boolean;
  onSubmit: () => void;
  onBackToLogin: () => void;
}) {
  if (success) return <ResetPasswordSuccess />;

  return (
    <ResetPasswordForm
      control={control}
      showPassword={showPassword}
      setShowPassword={setShowPassword}
      isSubmitting={isSubmitting}
      error={error}
      passwordError={passwordError}
      isValid={isValid}
      onSubmit={onSubmit}
      onBackToLogin={onBackToLogin}
    />
  );
}

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { token: tokenParam } = useLocalSearchParams<{ token: string }>();
  const token = typeof tokenParam === 'string' ? tokenParam : undefined;
  useEffect(() => {
    if (tokenParam && Platform.OS === 'web' && typeof window !== 'undefined') {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [tokenParam]);

  const {
    control,
    handleSubmit,
    formState: { errors, isValid, isSubmitting },
  } = useResetPasswordFormState();

  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useResetPasswordRedirect(success, router);
  const [showPassword, setShowPassword] = useState(false);
  const handleBackToLogin = () => router.push('/login');

  const handleResetPassword = handleSubmit(async (data: ResetPasswordFormValues) => {
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
          <ResetPasswordCardContent
            success={success}
            control={control}
            showPassword={showPassword}
            setShowPassword={setShowPassword}
            isSubmitting={isSubmitting}
            error={error}
            passwordError={errors.password?.message}
            isValid={isValid}
            onSubmit={handleResetPassword}
            onBackToLogin={handleBackToLogin}
          />
        </Card.Content>
      </Card>
    </View>
  );
}

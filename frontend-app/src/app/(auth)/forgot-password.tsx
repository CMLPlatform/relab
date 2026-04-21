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

type TimerWithUnref = ReturnType<typeof setTimeout> & { unref(): void };

function unrefTimer(timer: ReturnType<typeof setTimeout>) {
  if (timer && typeof timer === 'object' && 'unref' in timer) {
    (timer as TimerWithUnref).unref();
  }
}

function ForgotPasswordSuccess({
  color,
  onBackToLogin,
}: {
  color: string;
  onBackToLogin: () => void;
}) {
  return (
    <View style={{ gap: 12, alignItems: 'center', paddingVertical: 16 }}>
      <Text variant="bodyLarge" style={{ color, textAlign: 'center' }}>
        If an account exists with this email, you will receive password reset instructions.
      </Text>
      <Button mode="contained" onPress={onBackToLogin}>
        Back to Login
      </Button>
    </View>
  );
}

function ForgotPasswordForm({
  control,
  isSubmitting,
  error,
  emailError,
  isValid,
  onSubmit,
  onBackToLogin,
}: {
  control: ReturnType<typeof useForm<ForgotPasswordFormValues>>['control'];
  isSubmitting: boolean;
  error: string | null;
  emailError?: string;
  isValid: boolean;
  onSubmit: () => void;
  onBackToLogin: () => void;
}) {
  return (
    <>
      <Text variant="bodyMedium">
        Enter your email address and we&apos;ll send you instructions to reset your password.
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
        <HelperText type="error" visible={Boolean(error)}>
          {error}
        </HelperText>
      )}

      {!error && emailError && (
        <HelperText type="error" visible>
          {emailError}
        </HelperText>
      )}

      <Button
        mode="contained"
        onPress={onSubmit}
        loading={isSubmitting}
        disabled={isSubmitting || !isValid}
      >
        Send Reset Link
      </Button>

      <View style={{ flexDirection: 'row', gap: 16, justifyContent: 'center', marginTop: 8 }}>
        <Button mode="text" onPress={onBackToLogin}>
          Back to Login
        </Button>
      </View>
    </>
  );
}

function useForgotPasswordFormState() {
  return useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    mode: 'onChange',
    defaultValues: { email: '' },
  });
}

function useForgotPasswordRedirect(success: boolean, router: ReturnType<typeof useRouter>) {
  useEffect(() => {
    if (!success) return;

    const timer = setTimeout(() => {
      router.replace('/login');
    }, 5000);
    unrefTimer(timer);

    return () => clearTimeout(timer);
  }, [success, router]);
}

function ForgotPasswordCardContent({
  success,
  control,
  isSubmitting,
  error,
  emailError,
  isValid,
  onSubmit,
  onBack,
  onBackToLogin,
  themeColor,
}: {
  success: boolean;
  control: ReturnType<typeof useForm<ForgotPasswordFormValues>>['control'];
  isSubmitting: boolean;
  error: string | null;
  emailError?: string;
  isValid: boolean;
  onSubmit: () => void;
  onBack: () => void;
  onBackToLogin: () => void;
  themeColor: string;
}) {
  if (success) {
    return <ForgotPasswordSuccess color={themeColor} onBackToLogin={onBackToLogin} />;
  }

  return (
    <ForgotPasswordForm
      control={control}
      isSubmitting={isSubmitting}
      error={error}
      emailError={emailError}
      isValid={isValid}
      onSubmit={onSubmit}
      onBackToLogin={onBack}
    />
  );
}

export default function ForgotPasswordScreen() {
  const theme = useTheme();
  const router = useRouter();
  const {
    control,
    handleSubmit,
    formState: { errors, isValid, isSubmitting },
  } = useForgotPasswordFormState();

  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useForgotPasswordRedirect(success, router);
  const handleBack = () => router.back();
  const handleBackToLogin = () => router.push('/login');

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
          <ForgotPasswordCardContent
            success={success}
            control={control}
            isSubmitting={isSubmitting}
            error={error}
            emailError={errors.email?.message}
            isValid={isValid}
            onSubmit={handleForgotPassword}
            onBack={handleBack}
            onBackToLogin={handleBackToLogin}
            themeColor={theme.colors.primary}
          />
        </Card.Content>
      </Card>
    </View>
  );
}

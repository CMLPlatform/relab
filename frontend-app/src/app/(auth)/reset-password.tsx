import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, Card, HelperText, Text, TextInput } from 'react-native-paper';
import { apiFetch } from '@/services/api/fetching';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token: string }>();

  const [password, setPassword] = useState('');
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        router.push('/login');
      }, 3000);

      if (timer && typeof timer === 'object' && 'unref' in timer) {
        (timer as any).unref();
      }

      return () => clearTimeout(timer);
    }
  }, [success, router]);
  const [showPassword, setShowPassword] = useState(false);

  const handleResetPassword = async () => {
    if (!token) {
      setError('No reset token provided');
      return;
    }

    if (!password) {
      setError('Please enter a new password');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await apiFetch(`${process.env.EXPO_PUBLIC_API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      if (response.ok) {
        setSuccess(true);
        setError(null);
      } else {
        const data = await response.json();
        setError(data.detail || 'Password reset failed');
      }
    } catch (err) {
      console.error('Password reset error:', err);
      setError('An error occurred during password reset');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 16 }}>
      <Card>
        <Card.Content style={{ gap: 16 }}>
          <Text variant="headlineMedium">Reset Password</Text>

          {!success ? (
            <>
              <TextInput
                label="New Password"
                testID="password-input"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                disabled={isLoading}
                right={
                  <TextInput.Icon
                    icon={showPassword ? 'eye-off' : 'eye'}
                    onPress={() => setShowPassword(!showPassword)}
                  />
                }
              />

              {error && (
                <HelperText type="error" visible={!!error}>
                  {error}
                </HelperText>
              )}

              <Button
                mode="contained"
                onPress={handleResetPassword}
                loading={isLoading}
                disabled={isLoading || !password}
              >
                Reset Password
              </Button>

              <View style={{ flexDirection: 'row', gap: 16, justifyContent: 'center', marginTop: 8 }}>
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

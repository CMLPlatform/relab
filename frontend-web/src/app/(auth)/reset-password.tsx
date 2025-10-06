import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Button, Card, HelperText, Text, TextInput } from 'react-native-paper';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token: string }>();

  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
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
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          password,
        }),
        credentials: 'include',
      });

      if (response.ok) {
        setSuccess(true);
        setError(null);
        // Redirect to homepage
        // TODO: Replace this with platform-dependent code (app urls for mobile, login page on main site for web)
        setTimeout(() => {
          router.push('/');
        }, 3000);
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
      <Stack.Screen
        options={{
          title: 'Reset Password',
          headerShown: true,
        }}
      />

      <Card>
        <Card.Content style={{ gap: 16 }}>
          <Text variant="headlineMedium">Reset Password</Text>

          {!success ? (
            <>
              <TextInput
                label="New Password"
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
                <Button mode="text" onPress={() => router.push('/')}>
                  Homepage
                </Button>
                <Button mode="text" onPress={() => router.push('/')}>
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

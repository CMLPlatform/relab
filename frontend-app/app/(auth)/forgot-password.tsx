import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Button, Card, HelperText, Text, TextInput, useTheme } from 'react-native-paper';
import validator from 'validator';

export default function ForgotPasswordScreen() {
  const theme = useTheme();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const isValidEmail = validator.isEmail(email);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Please enter your email address');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
        credentials: 'include',
      });

      if (response.ok) {
        setSuccess(true);
        setError(null);
      } else {
        const data = await response.json();
        setError(data.detail || 'Failed to send reset email');
      }
    } catch (err) {
      console.error('Forgot password error:', err);
      setError('An error occurred. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Card>
        <Card.Content style={{ gap: 16 }}>
          <Text variant="headlineMedium">Forgot Password</Text>

          {!success ? (
            <>
              <Text variant="bodyMedium">
                Enter your email address and we&apos;ll send you instructions to reset your password.
              </Text>

              <TextInput
                label="Email"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                disabled={isLoading}
              />

              {error && (
                <HelperText type="error" visible={!!error}>
                  {error}
                </HelperText>
              )}

              <Button
                mode="contained"
                onPress={handleForgotPassword}
                loading={isLoading}
                disabled={isLoading || !isValidEmail}
              >
                Send Reset Link
              </Button>

              <View style={{ flexDirection: 'row', gap: 16, justifyContent: 'center', marginTop: 8 }}>
                <Button mode="text" onPress={() => router.back()}>
                  Back to Login
                </Button>
              </View>
            </>
          ) : (
            <View style={{ gap: 12, alignItems: 'center', paddingVertical: 16 }}>
              <Text variant="bodyLarge" style={{ color: theme.colors.primary, textAlign: 'center' }}>
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

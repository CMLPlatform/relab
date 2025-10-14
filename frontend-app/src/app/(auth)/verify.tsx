import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { ActivityIndicator, Button, Card, Text, useTheme } from 'react-native-paper';

export default function VerifyEmailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token: string }>();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const verifyToken = useCallback(async () => {
    if (!token) {
      setError('No verification token provided. Please check your verification email.');
      setIsLoading(false);
      return;
    }

    const apiUrl = `${process.env.EXPO_PUBLIC_API_URL}/auth/verify`;

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
        credentials: 'include',
      });

      if (response.ok) {
        setSuccess(true);
        setError(null);
        setTimeout(() => {
          router.replace('/login');
        }, 3000);
      } else {
        const data = await response.json();
        setError(data.detail || 'Verification failed. Please try registering again.');
      }
    } catch (err) {
      setError('An error occurred during verification. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  }, [token, router]);

  useEffect(() => {
    verifyToken();
  }, [verifyToken]);

  return (
    <View style={{ flex: 1 }}>
      <Card>
        <Card.Content style={{ gap: 16, alignItems: 'center', paddingVertical: 32 }}>
          <Text variant="headlineMedium">Verify Email</Text>

          {isLoading && (
            <View style={{ gap: 12, alignItems: 'center' }}>
              <ActivityIndicator size="large" />
              <Text variant="bodyLarge">Verifying your email...</Text>
            </View>
          )}

          {error && !isLoading && (
            <View style={{ gap: 12, alignItems: 'center' }}>
              <Text variant="bodyLarge" style={{ color: theme.colors.error, textAlign: 'center' }}>
                {error}
              </Text>
              <Button mode="contained" onPress={() => router.replace('/')}>
                Back to Home
              </Button>
            </View>
          )}

          {success && !isLoading && (
            <View style={{ gap: 12, alignItems: 'center' }}>
              <Text variant="bodyLarge" style={{ color: theme.colors.primary, textAlign: 'center' }}>
                Email verified successfully! You can now login.
              </Text>
              <Text variant="bodyMedium">Redirecting to home...</Text>
            </View>
          )}
        </Card.Content>
      </Card>
    </View>
  );
}

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { ActivityIndicator, Button, Card, Text, useTheme } from 'react-native-paper';
import { API_URL } from '@/config';
import { useAuth } from '@/context/AuthProvider';
import { apiFetch } from '@/services/api/fetching';

type TimerWithUnref = ReturnType<typeof setTimeout> & { unref(): void };

export default function VerifyEmailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user, refetch } = useAuth();
  const { token: tokenParam } = useLocalSearchParams<{ token: string }>();

  // Capture the token from the URL into a ref immediately, then strip it from
  // the address bar so it doesn't persist in browser history.
  const tokenRef = useRef(tokenParam);
  useEffect(() => {
    if (tokenParam && Platform.OS === 'web' && typeof window !== 'undefined') {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [tokenParam]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        if (user) {
          refetch(true).then(() => router.replace('/products'));
        } else {
          router.replace('/login?redirectTo=/products');
        }
      }, 3000);

      if (timer && typeof timer === 'object' && 'unref' in timer) {
        (timer as TimerWithUnref).unref();
      }

      return () => clearTimeout(timer);
    }
  }, [success, router, user, refetch]);

  const verifyToken = useCallback(async () => {
    const token = tokenRef.current;
    if (!token) {
      setError('No verification token provided. Please check your verification email.');
      setIsLoading(false);
      return;
    }

    const apiUrl = `${API_URL}/auth/verify`;

    try {
      const response = await apiFetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }), // token was captured from URL before stripping
      });

      if (response.ok) {
        setSuccess(true);
        setError(null);
      } else {
        const data = await response.json();
        setError(data.detail || 'Verification failed. Please try registering again.');
      }
    } catch (err) {
      console.error('Verification error:', err);
      setError('An error occurred during verification. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  }, []);

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
              <Text
                variant="bodyLarge"
                style={{ color: theme.colors.primary, textAlign: 'center' }}
              >
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

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { ActivityIndicator, Button, Card, Text, useTheme } from 'react-native-paper';
import { API_URL } from '@/config';
import { useAuth } from '@/context/auth';
import { apiFetch } from '@/services/api/client';
import { logError } from '@/utils/logging';

type TimerWithUnref = ReturnType<typeof setTimeout> & { unref(): void };

function unrefTimer(timer: ReturnType<typeof setTimeout>) {
  if (timer && typeof timer === 'object' && 'unref' in timer) {
    (timer as TimerWithUnref).unref();
  }
}

function getVerificationErrorMessage(detail: unknown) {
  return typeof detail === 'string' ? detail : 'Verification failed. Please try registering again.';
}

async function verifyToken(token: string) {
  return apiFetch(`${API_URL}/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
}

function useVerificationRedirect({
  success,
  user,
  refetch,
  router,
}: {
  success: boolean;
  user: ReturnType<typeof useAuth>['user'];
  refetch: ReturnType<typeof useAuth>['refetch'];
  router: ReturnType<typeof useRouter>;
}) {
  useEffect(() => {
    if (!success) return;

    const timer = setTimeout(() => {
      if (user) {
        refetch(true).then(() => router.replace('/products'));
      } else {
        router.replace('/login?redirectTo=/products');
      }
    }, 3000);
    unrefTimer(timer);

    return () => clearTimeout(timer);
  }, [success, router, user, refetch]);
}

function useVerifyToken({
  token,
  setError,
  setIsLoading,
  setSuccess,
}: {
  token: string | undefined;
  setError: (value: string | null) => void;
  setIsLoading: (value: boolean) => void;
  setSuccess: (value: boolean) => void;
}) {
  useEffect(() => {
    let cancelled = false;

    const finish = (callback: () => void) => {
      if (!cancelled) callback();
    };

    const handleMissingToken = () => {
      finish(() => {
        setError('No verification token provided. Please check your verification email.');
        setIsLoading(false);
      });
    };

    const runVerification = async () => {
      if (!token) {
        handleMissingToken();
        return;
      }

      try {
        const response = await verifyToken(token);
        if (cancelled) return;

        if (response.ok) {
          setSuccess(true);
          setError(null);
          return;
        }

        const data = await response.json();
        finish(() => setError(getVerificationErrorMessage(data.detail)));
      } catch (err) {
        logError('Verification error:', err);
        finish(() => setError('An error occurred during verification. Please try again later.'));
      } finally {
        finish(() => setIsLoading(false));
      }
    };

    runVerification().catch((err) => {
      logError('Verification effect error:', err);
      finish(() => {
        setError('An error occurred during verification. Please try again later.');
        setIsLoading(false);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [token, setError, setIsLoading, setSuccess]);
}

export default function VerifyEmailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user, refetch } = useAuth();
  const { token: tokenParam } = useLocalSearchParams<{ token: string }>();
  const token = typeof tokenParam === 'string' ? tokenParam : undefined;

  useEffect(() => {
    if (tokenParam && Platform.OS === 'web' && typeof window !== 'undefined') {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [tokenParam]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useVerificationRedirect({ success, user, refetch, router });
  useVerifyToken({ token, setError, setIsLoading, setSuccess });

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

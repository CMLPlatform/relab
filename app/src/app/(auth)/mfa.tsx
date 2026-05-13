import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Button, HelperText, Text, TextInput } from 'react-native-paper';
import { getSafeRedirectTarget, routeAuthenticatedUser } from '@/hooks/auth/useLoginRedirect';
import { getUser } from '@/services/api/authentication';
import {
  clearPendingMfaLogin,
  completeMfaChallenge,
  getPendingMfaLogin,
} from '@/services/api/authMfa';

function normalizeTotpCode(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6);
}

export default function MfaScreen() {
  const router = useRouter();
  const pending = getPendingMfaLogin();
  const token = pending?.mfaToken;
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);
  const canSubmit = Boolean(token) && code.length === 6;
  const visibleError = error ?? (pending ? null : 'MFA session expired. Please log in again.');

  const submit = async () => {
    if (!token) {
      setError('MFA session expired. Please log in again.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await completeMfaChallenge(token, code);
      clearPendingMfaLogin();
      const authenticatedUser = await getUser(true);
      if (authenticatedUser) {
        routeAuthenticatedUser({
          authenticatedUser,
          router,
          postLoginRedirect: getSafeRedirectTarget(pending?.redirectTo),
        });
        return;
      }
      router.replace('/products');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid MFA code.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 20, gap: 16 }}>
      <Text variant="headlineMedium">Multi-factor authentication</Text>
      <TextInput
        mode="outlined"
        value={code}
        onChangeText={(value) => setCode(normalizeTotpCode(value))}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        placeholder="6-digit code"
        maxLength={6}
        disabled={isSubmitting || !token}
      />
      {visibleError ? (
        <HelperText type="error" visible>
          {visibleError}
        </HelperText>
      ) : null}
      <Button
        mode="contained"
        onPress={submit}
        loading={isSubmitting}
        disabled={isSubmitting || !canSubmit}
      >
        Continue
      </Button>
    </View>
  );
}

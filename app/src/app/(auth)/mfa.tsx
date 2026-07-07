import { useCallback } from 'react';
import { View } from 'react-native';
import { Button, HelperText, Text, TextInput } from 'react-native-paper';
import { OtpInput } from '@/components/base/OtpInput';
import { useMfaScreen } from '@/features/auth/useMfaScreen';

export default function MfaScreen() {
  const {
    code,
    recoveryCode,
    useRecoveryCode,
    isSubmitting,
    canSubmit,
    tokenPresent,
    visibleError,
    handleCodeChange,
    handleRecoveryCodeChange,
    toggleRecoveryMode,
    submit,
  } = useMfaScreen();
  const submitCurrent = useCallback(() => submit(), [submit]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 20 }}>
      <View style={{ gap: 6 }}>
        <Text variant="headlineMedium">Two-step verification</Text>
        <Text variant="bodyMedium" style={{ opacity: 0.7 }}>
          {useRecoveryCode
            ? 'Enter one of your saved recovery codes.'
            : 'Enter the 6-digit code from your authenticator app.'}
        </Text>
      </View>

      {useRecoveryCode ? (
        <TextInput
          mode="outlined"
          label="Recovery code"
          accessibilityLabel="Recovery code"
          value={recoveryCode}
          onChangeText={handleRecoveryCodeChange}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          disabled={isSubmitting || !tokenPresent}
        />
      ) : (
        <OtpInput
          value={code}
          onChangeText={handleCodeChange}
          onComplete={submit}
          disabled={isSubmitting || !tokenPresent}
          hasError={Boolean(visibleError)}
          autoFocus
          accessibilityLabel="6-digit code"
        />
      )}

      {visibleError ? (
        <HelperText type="error" visible>
          {visibleError}
        </HelperText>
      ) : null}

      <Button
        mode="contained"
        onPress={submitCurrent}
        loading={isSubmitting}
        disabled={isSubmitting || !canSubmit}
      >
        {useRecoveryCode ? 'Sign in' : 'Continue'}
      </Button>

      <Button mode="text" compact onPress={toggleRecoveryMode} disabled={!tokenPresent}>
        {useRecoveryCode ? 'Use your authenticator app' : 'Use a recovery code'}
      </Button>
    </View>
  );
}

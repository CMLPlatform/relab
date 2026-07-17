import { useCallback } from 'react';
import { View } from 'react-native';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { Card } from '@/components/base/Card';
import { OtpInput } from '@/components/base/OtpInput';
import { TextInput } from '@/components/base/TextInput';
import { useMfaScreen } from '@/features/auth/useMfaScreen';
import { useAppTheme } from '@/theme';

export default function MfaScreen() {
  const theme = useAppTheme();
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
    goToLogin,
  } = useMfaScreen();
  const submitCurrent = useCallback(() => submit(), [submit]);

  return (
    <AuthScreen>
      <Card>
        <View style={{ padding: 16, gap: 16 }}>
          <View style={{ gap: 6 }}>
            <AppText variant="display">Two-step verification</AppText>
            <AppText variant="body" style={{ opacity: 0.7 }}>
              {useRecoveryCode
                ? 'Enter one of your saved recovery codes.'
                : 'Enter the 6-digit code from your authenticator app.'}
            </AppText>
          </View>

          {useRecoveryCode ? (
            <View style={{ gap: 4 }}>
              <AppText variant="label">Recovery code</AppText>
              <TextInput
                value={recoveryCode}
                onChangeText={handleRecoveryCodeChange}
                autoCapitalize="characters"
                autoCorrect={false}
                autoComplete="off"
                editable={!isSubmitting && tokenPresent}
                placeholder="One of your saved codes"
                accessibilityLabel="Recovery code"
                style={{
                  borderWidth: 1,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderColor: theme.colors.outline,
                }}
              />
            </View>
          ) : (
            <OtpInput
              value={code}
              onChangeText={handleCodeChange}
              onComplete={submit}
              disabled={isSubmitting || !tokenPresent}
              hasError={Boolean(visibleError)}
              autoFocus
              label="Authentication code"
            />
          )}

          {visibleError ? (
            <AppText style={{ color: theme.tokens.status.danger }}>{visibleError}</AppText>
          ) : null}

          <AppButton
            variant="primary"
            onPress={submitCurrent}
            loading={isSubmitting}
            disabled={isSubmitting || !canSubmit}
          >
            {useRecoveryCode ? 'Sign in' : 'Continue'}
          </AppButton>

          <AppButton variant="ghost" onPress={toggleRecoveryMode} disabled={!tokenPresent}>
            {useRecoveryCode ? 'Use your authenticator app' : 'Use a recovery code'}
          </AppButton>

          <AppButton variant="ghost" onPress={goToLogin}>
            Back to login
          </AppButton>
        </View>
      </Card>
    </AuthScreen>
  );
}

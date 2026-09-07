import { useCallback } from 'react';
import { View } from 'react-native';
import { AuthCard, AuthFormError } from '@/components/auth/AuthCardSections';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { OtpInput } from '@/components/base/OtpInput';
import { TextInput } from '@/components/base/TextInput';
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
    goToLogin,
  } = useMfaScreen();
  const submitCurrent = useCallback(() => submit(), [submit]);

  return (
    <AuthScreen>
      <AuthCard
        title="Two-step verification"
        subtitle={
          <AppText variant="body" style={{ opacity: 0.7 }}>
            {useRecoveryCode
              ? 'Enter one of your saved recovery codes.'
              : 'Enter the 6-digit code from your authenticator app.'}
          </AppText>
        }
      >
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
              bordered
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

        <AuthFormError message={visibleError} />

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
      </AuthCard>
    </AuthScreen>
  );
}

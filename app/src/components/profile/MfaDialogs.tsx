import { setStringAsync } from 'expo-clipboard';
import { type RefObject, useCallback } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { AppButton } from '@/components/base/AppButton';
import { AppDialog } from '@/components/base/AppDialog';
import { AppText } from '@/components/base/AppText';
import { dialogActionsStyle, dialogTitleStyle } from '@/components/base/dialogStyles';
import { OtpInput } from '@/components/base/OtpInput';
import { TextInput } from '@/components/base/TextInput';
import { radius } from '@/constants';
import type { MfaSetupController } from '@/features/profile/useMfaSetup';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { type AppTheme, memoizeByTheme, useAppTheme } from '@/theme';

const SECRET_CHUNK_PATTERN = /.{1,4}/g;

/** Groups the base32 key into 4-char blocks so it can be read aloud / typed. */
function chunkSecret(secret: string): string {
  return (secret.match(SECRET_CHUNK_PATTERN) ?? []).join(' ');
}

type MfaDialogsProps = {
  mfa: MfaSetupController;
  enrollTriggerRef?: RefObject<View | null>;
  disableTriggerRef?: RefObject<View | null>;
  regenerateTriggerRef?: RefObject<View | null>;
};

/** The four TOTP dialogs: enroll, turn off, regenerate codes, and show codes. */
export function MfaDialogs({
  mfa,
  enrollTriggerRef,
  disableTriggerRef,
  regenerateTriggerRef,
}: MfaDialogsProps) {
  const theme = useAppTheme();
  const local = createMfaDialogStyles(theme);
  const feedback = useAppFeedback();

  const { confirm, disable, regenerate, cancel, recoveryCodes } = mfa;
  const secret = mfa.setup?.secret ?? '';
  const otpauthUri = mfa.setup?.otpauthUri;

  const copyKey = useCallback(async () => {
    await setStringAsync(secret);
    feedback.toast('Key copied');
  }, [feedback, secret]);
  const copyRecoveryCodes = useCallback(async () => {
    await setStringAsync((recoveryCodes ?? []).join('\n'));
    feedback.toast('Recovery codes copied');
  }, [feedback, recoveryCodes]);
  const submitEnroll = useCallback(() => confirm(), [confirm]);
  const submitDisable = useCallback(() => disable(), [disable]);
  const submitRegenerate = useCallback(() => regenerate(), [regenerate]);
  const openAuthenticatorApp = useCallback(() => {
    if (otpauthUri) Linking.openURL(otpauthUri);
  }, [otpauthUri]);

  return (
    <>
      <AppDialog visible={mfa.mode === 'enroll'} onDismiss={cancel} triggerRef={enrollTriggerRef}>
        <AppText variant="plain" accessibilityRole="header" style={dialogTitleStyle}>
          Set up two-step verification
        </AppText>
        <AppText variant="plain" className="opacity-75 mb-4" style={local.step}>
          Scan this with an authenticator app, or enter the key by hand. Then type the 6-digit code
          it shows.
        </AppText>

        {otpauthUri ? (
          <View className="self-center p-4 rounded-lg mb-4" style={local.qrFrame}>
            <QRCode value={otpauthUri} size={168} color="#101010" backgroundColor="#ffffff" />
          </View>
        ) : null}

        <View style={local.keyRow}>
          <AppText variant="plain" selectable style={local.key}>
            {chunkSecret(secret)}
          </AppText>
          {/* NOTE: dropped Paper's leading copy icon — AppButton has no icon slot; text-only matches Chip's precedent. */}
          <AppButton variant="ghost" onPress={copyKey}>
            Copy
          </AppButton>
        </View>

        {Platform.OS !== 'web' && otpauthUri ? (
          <AppButton variant="ghost" onPress={openAuthenticatorApp}>
            Open authenticator app
          </AppButton>
        ) : null}

        <TextInput
          value={mfa.password}
          onChangeText={mfa.setPassword}
          placeholder="Current password"
          accessibilityLabel="Current password"
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          style={[local.field, { borderColor: theme.colors.outline }]}
        />
        <AppText variant="plain" className="mt-2 opacity-60" style={local.hint}>
          Signed up with Google or GitHub? Use your Relab account password — if you never set one,
          create it with “Forgot password” on the login screen first.
        </AppText>

        <View className="mt-4">
          <OtpInput
            value={mfa.code}
            onChangeText={mfa.setCode}
            onComplete={confirm}
            disabled={mfa.busy}
            hasError={Boolean(mfa.error)}
            label="Setup code"
          />
        </View>

        {mfa.error ? (
          <AppText variant="plain" className="mt-3 text-destructive" style={local.error}>
            {mfa.error}
          </AppText>
        ) : null}

        <View style={dialogActionsStyle}>
          <AppButton variant="ghost" onPress={cancel}>
            Cancel
          </AppButton>
          <AppButton onPress={submitEnroll} loading={mfa.busy} disabled={!mfa.canSubmit}>
            Confirm
          </AppButton>
        </View>
      </AppDialog>

      <AppDialog visible={mfa.mode === 'disable'} onDismiss={cancel} triggerRef={disableTriggerRef}>
        <AppText variant="plain" accessibilityRole="header" style={dialogTitleStyle}>
          Enter a current code
        </AppText>
        <AppText variant="plain" className="opacity-75 mb-4" style={local.step}>
          {mfa.useRecoveryCode
            ? 'Enter one of your saved recovery codes to confirm it’s you.'
            : 'Type a code from your authenticator app to confirm it’s you.'}
        </AppText>

        {mfa.useRecoveryCode ? (
          // Labelled like the OtpInput it swaps with, so toggling recovery mode
          // doesn't make the field's label appear and disappear.
          <View className="mt-4 gap-1">
            <AppText variant="label">Recovery code</AppText>
            <TextInput
              value={mfa.recoveryInput}
              onChangeText={mfa.setRecoveryInput}
              placeholder="One of your saved codes"
              accessibilityLabel="Recovery code"
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              editable={!mfa.busy}
              style={[local.field, { marginTop: 0, borderColor: theme.colors.outline }]}
            />
          </View>
        ) : (
          <View className="mt-4">
            <OtpInput
              value={mfa.code}
              onChangeText={mfa.setCode}
              onComplete={disable}
              disabled={mfa.busy}
              hasError={Boolean(mfa.error)}
              autoFocus
              label="Current code"
            />
          </View>
        )}

        {mfa.error ? (
          <AppText variant="plain" className="mt-3 text-destructive" style={local.error}>
            {mfa.error}
          </AppText>
        ) : null}

        <AppButton variant="ghost" onPress={mfa.toggleRecoveryInput} className="mt-3 self-start">
          {mfa.useRecoveryCode
            ? 'Use your authenticator app'
            : 'Lost your authenticator? Use a recovery code'}
        </AppButton>

        <View style={dialogActionsStyle}>
          <AppButton variant="ghost" onPress={cancel}>
            Cancel
          </AppButton>
          <AppButton
            variant="destructive"
            onPress={submitDisable}
            loading={mfa.busy}
            disabled={!mfa.canSubmit}
          >
            Confirm
          </AppButton>
        </View>
      </AppDialog>

      <AppDialog
        visible={mfa.mode === 'regenerate'}
        onDismiss={cancel}
        triggerRef={regenerateTriggerRef}
      >
        <AppText variant="plain" accessibilityRole="header" style={dialogTitleStyle}>
          Generate new recovery codes
        </AppText>
        <AppText variant="plain" className="opacity-75 mb-4" style={local.step}>
          Enter a code from your authenticator app. This replaces your old codes — any you
          haven&apos;t used will stop working.
        </AppText>

        <View className="mt-4">
          <OtpInput
            value={mfa.code}
            onChangeText={mfa.setCode}
            onComplete={regenerate}
            disabled={mfa.busy}
            hasError={Boolean(mfa.error)}
            autoFocus
            label="Current code"
          />
        </View>

        {mfa.error ? (
          <AppText variant="plain" className="mt-3 text-destructive" style={local.error}>
            {mfa.error}
          </AppText>
        ) : null}

        <View style={dialogActionsStyle}>
          <AppButton variant="ghost" onPress={cancel}>
            Cancel
          </AppButton>
          <AppButton onPress={submitRegenerate} loading={mfa.busy} disabled={!mfa.canSubmit}>
            Generate
          </AppButton>
        </View>
      </AppDialog>

      {/* NOTE: no triggerRef — 'codes' mode is entered internally from the enroll/regenerate
          flows (useMfaSetup.ts), not from a distinct in-screen trigger. */}
      <AppDialog visible={mfa.mode === 'codes'} onDismiss={cancel} dismissable={false}>
        <AppText variant="plain" accessibilityRole="header" style={dialogTitleStyle}>
          Save your recovery codes
        </AppText>
        <AppText variant="plain" className="opacity-75 mb-4" style={local.step}>
          Keep these somewhere safe. Each code works once to sign in if you lose your authenticator.
          This is the only time they&apos;re shown.
        </AppText>

        <View className="rounded-lg py-3 px-4 mb-2 gap-1" style={local.codesBox}>
          {(recoveryCodes ?? []).map((recoveryCode) => (
            <AppText variant="plain" key={recoveryCode} selectable style={local.recoveryCode}>
              {recoveryCode}
            </AppText>
          ))}
        </View>

        <AppButton variant="ghost" onPress={copyRecoveryCodes}>
          Copy all
        </AppButton>

        <View style={dialogActionsStyle}>
          <AppButton variant="ghost" onPress={cancel}>
            Done
          </AppButton>
        </View>
      </AppDialog>
    </>
  );
}

const createMfaDialogStyles = memoizeByTheme((theme: AppTheme) =>
  StyleSheet.create({
    step: {
      fontSize: 14,
    },
    qrFrame: {
      backgroundColor: '#ffffff',
    },
    keyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      backgroundColor: theme.tokens.surface.sunken,
      borderRadius: radius.control,
      paddingVertical: 8,
      paddingLeft: 14,
      paddingRight: 6,
    },
    key: {
      flex: 1,
      fontSize: 15,
      letterSpacing: 1,
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    },
    field: {
      borderWidth: 1,
      borderRadius: radius.sm,
      paddingHorizontal: 8,
      paddingVertical: 8,
      marginTop: 16,
    },
    hint: {
      fontSize: 12,
    },
    codesBox: {
      backgroundColor: theme.tokens.surface.sunken,
    },
    recoveryCode: {
      fontSize: 16,
      letterSpacing: 1,
      textAlign: 'center',
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    },
    error: {
      fontSize: 13,
    },
  }),
);

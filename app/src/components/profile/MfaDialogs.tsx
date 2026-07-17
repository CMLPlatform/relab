import { setStringAsync } from 'expo-clipboard';
import { useCallback } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { AppButton } from '@/components/base/AppButton';
import { AppDialog } from '@/components/base/AppDialog';
import { dialogActionsStyle, dialogTitleStyle } from '@/components/base/dialogStyles';
import { OtpInput } from '@/components/base/OtpInput';
import { Text } from '@/components/base/Text';
import { TextInput } from '@/components/base/TextInput';
import { radius, spacing } from '@/constants';
import type { MfaSetupController } from '@/features/profile/useMfaSetup';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { type AppTheme, memoizeByTheme, useAppTheme } from '@/theme';

const SECRET_CHUNK_PATTERN = /.{1,4}/g;

/** Groups the base32 key into 4-char blocks so it can be read aloud / typed. */
function chunkSecret(secret: string): string {
  return (secret.match(SECRET_CHUNK_PATTERN) ?? []).join(' ');
}

/** The four TOTP dialogs: enroll, turn off, regenerate codes, and show codes. */
export function MfaDialogs({ mfa }: { mfa: MfaSetupController }) {
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
      <AppDialog visible={mfa.mode === 'enroll'} onDismiss={cancel}>
        <Text accessibilityRole="header" style={dialogTitleStyle}>
          Set up two-step verification
        </Text>
        <Text style={local.step}>
          Scan this with an authenticator app, or enter the key by hand. Then type the 6-digit code
          it shows.
        </Text>

        {otpauthUri ? (
          <View style={local.qrFrame}>
            <QRCode value={otpauthUri} size={168} color="#101010" backgroundColor="#ffffff" />
          </View>
        ) : null}

        <View style={local.keyRow}>
          <Text selectable style={local.key}>
            {chunkSecret(secret)}
          </Text>
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
        <Text style={local.hint}>
          Signed up with Google or GitHub? Use your Relab account password — if you never set one,
          create it with “Forgot password” on the login screen first.
        </Text>

        <View style={local.codeField}>
          <OtpInput
            value={mfa.code}
            onChangeText={mfa.setCode}
            onComplete={confirm}
            disabled={mfa.busy}
            hasError={Boolean(mfa.error)}
            label="Setup code"
          />
        </View>

        {mfa.error ? <Text style={local.error}>{mfa.error}</Text> : null}

        <View style={dialogActionsStyle}>
          <AppButton variant="ghost" onPress={cancel}>
            Cancel
          </AppButton>
          <AppButton onPress={submitEnroll} loading={mfa.busy} disabled={!mfa.canSubmit}>
            Confirm
          </AppButton>
        </View>
      </AppDialog>

      <AppDialog visible={mfa.mode === 'disable'} onDismiss={cancel}>
        <Text accessibilityRole="header" style={dialogTitleStyle}>
          Enter a current code
        </Text>
        <Text style={local.step}>
          {mfa.useRecoveryCode
            ? 'Enter one of your saved recovery codes to confirm it’s you.'
            : 'Type a code from your authenticator app to confirm it’s you.'}
        </Text>

        {mfa.useRecoveryCode ? (
          <TextInput
            value={mfa.recoveryInput}
            onChangeText={mfa.setRecoveryInput}
            placeholder="Recovery code"
            accessibilityLabel="Recovery code"
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            editable={!mfa.busy}
            style={[local.codeField, local.field, { borderColor: theme.colors.outline }]}
          />
        ) : (
          <View style={local.codeField}>
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

        {mfa.error ? <Text style={local.error}>{mfa.error}</Text> : null}

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

      <AppDialog visible={mfa.mode === 'regenerate'} onDismiss={cancel}>
        <Text accessibilityRole="header" style={dialogTitleStyle}>
          Generate new recovery codes
        </Text>
        <Text style={local.step}>
          Enter a code from your authenticator app. This replaces your old codes — any you
          haven&apos;t used will stop working.
        </Text>

        <View style={local.codeField}>
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

        {mfa.error ? <Text style={local.error}>{mfa.error}</Text> : null}

        <View style={dialogActionsStyle}>
          <AppButton variant="ghost" onPress={cancel}>
            Cancel
          </AppButton>
          <AppButton onPress={submitRegenerate} loading={mfa.busy} disabled={!mfa.canSubmit}>
            Generate
          </AppButton>
        </View>
      </AppDialog>

      <AppDialog visible={mfa.mode === 'codes'} onDismiss={cancel} dismissable={false}>
        <Text accessibilityRole="header" style={dialogTitleStyle}>
          Save your recovery codes
        </Text>
        <Text style={local.step}>
          Keep these somewhere safe. Each code works once to sign in if you lose your authenticator.
          This is the only time they&apos;re shown.
        </Text>

        <View style={local.codesBox}>
          {(recoveryCodes ?? []).map((recoveryCode) => (
            <Text key={recoveryCode} selectable style={local.recoveryCode}>
              {recoveryCode}
            </Text>
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
      opacity: 0.75,
      marginBottom: 16,
    },
    qrFrame: {
      alignSelf: 'center',
      padding: 16,
      borderRadius: radius.card,
      backgroundColor: '#ffffff',
      marginBottom: 16,
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
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
      marginTop: 16,
    },
    hint: {
      marginTop: 8,
      fontSize: 12,
      opacity: 0.6,
    },
    codeField: {
      marginTop: 16,
    },
    codesBox: {
      backgroundColor: theme.tokens.surface.sunken,
      borderRadius: radius.card,
      paddingVertical: 12,
      paddingHorizontal: 16,
      marginBottom: 8,
      gap: 4,
    },
    recoveryCode: {
      fontSize: 16,
      letterSpacing: 1,
      textAlign: 'center',
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    },
    error: {
      marginTop: 12,
      fontSize: 13,
      color: theme.tokens.status.danger,
    },
  }),
);

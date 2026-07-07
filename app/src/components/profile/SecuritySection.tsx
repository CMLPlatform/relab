import { setStringAsync } from 'expo-clipboard';
import { useCallback } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { Button, Dialog, Icon, Portal, TextInput } from 'react-native-paper';
import QRCode from 'react-native-qrcode-svg';
import { OtpInput } from '@/components/base/OtpInput';
import { Text } from '@/components/base/Text';
import { useMfaSetup } from '@/features/profile/useMfaSetup';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { type AppTheme, useAppTheme } from '@/theme';
import { ProfileAction, ProfileSectionHeader } from './shared';
import { createProfileSectionStyles } from './styles';

type ProfileSecuritySectionProps = {
  mfaEnabled: boolean;
  onEnrolled: () => unknown;
};

/** Groups the base32 key into 4-char blocks so it can be read aloud / typed. */
function chunkSecret(secret: string): string {
  return (secret.match(/.{1,4}/g) ?? []).join(' ');
}

export function ProfileSecuritySection({ mfaEnabled, onEnrolled }: ProfileSecuritySectionProps) {
  const theme = useAppTheme();
  const styles = createProfileSectionStyles(theme);
  const local = createLocalStyles(theme);
  const feedback = useAppFeedback();
  const mfa = useMfaSetup(onEnrolled);
  const setup = mfa.setup;
  const secret = setup?.secret ?? '';
  const otpauthUri = setup?.otpauthUri;

  const { start, confirm, disable, beginDisable, beginRegenerate, regenerate, cancel } = mfa;
  const recoveryCodes = mfa.recoveryCodes;
  const copyKey = useCallback(async () => {
    await setStringAsync(secret);
    feedback.toast('Key copied');
  }, [feedback, secret]);
  const copyRecoveryCodes = useCallback(async () => {
    await setStringAsync((recoveryCodes ?? []).join('\n'));
    feedback.toast('Recovery codes copied');
  }, [feedback, recoveryCodes]);
  const beginReset = useCallback(() => beginDisable(true), [beginDisable]);
  const beginTurnOff = useCallback(() => beginDisable(false), [beginDisable]);
  const submitEnroll = useCallback(() => confirm(), [confirm]);
  const submitDisable = useCallback(() => disable(), [disable]);
  const submitRegenerate = useCallback(() => regenerate(), [regenerate]);
  const openAuthenticatorApp = useCallback(() => {
    if (otpauthUri) Linking.openURL(otpauthUri);
  }, [otpauthUri]);

  return (
    <>
      <ProfileSectionHeader title="Security" />
      <View style={styles.section}>
        {mfaEnabled ? (
          <>
            <View style={styles.action}>
              <View style={styles.actionCopy}>
                <Text style={styles.actionTitle}>Two-step verification</Text>
                <Text style={styles.actionSubtitle}>On — you enter a code at login</Text>
              </View>
              <Icon source="check-circle" size={22} color={theme.tokens.status.success} />
            </View>
            <ProfileAction
              title="Generate new recovery codes"
              subtitle="Replace your saved backup codes"
              onPress={beginRegenerate}
            />
            <ProfileAction
              title="Reset authenticator key"
              subtitle="Swap to a new authenticator app"
              onPress={beginReset}
            />
            <ProfileAction
              title="Turn off two-step verification"
              subtitle="Log in with just your password"
              onPress={beginTurnOff}
              titleStyle={styles.danger}
            />
          </>
        ) : (
          <ProfileAction
            title="Two-step verification"
            subtitle={mfa.starting ? 'Preparing…' : 'Protect logins with an authenticator app'}
            onPress={start}
          />
        )}
      </View>

      <Portal>
        <Dialog visible={mfa.mode === 'enroll'} onDismiss={cancel}>
          <Dialog.Title>Set up two-step verification</Dialog.Title>
          <Dialog.Content>
            <Text style={local.step}>
              Scan this with an authenticator app, or enter the key by hand. Then type the 6-digit
              code it shows.
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
              <Button compact icon="content-copy" onPress={copyKey}>
                Copy
              </Button>
            </View>

            {Platform.OS !== 'web' && otpauthUri ? (
              <Button compact onPress={openAuthenticatorApp}>
                Open authenticator app
              </Button>
            ) : null}

            <TextInput
              mode="outlined"
              label="Current password"
              value={mfa.password}
              onChangeText={mfa.setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="current-password"
              textContentType="password"
              style={local.passwordField}
            />

            <View style={local.codeField}>
              <OtpInput
                value={mfa.code}
                onChangeText={mfa.setCode}
                onComplete={confirm}
                disabled={mfa.busy}
                hasError={Boolean(mfa.error)}
                accessibilityLabel="Setup code"
              />
            </View>

            {mfa.error ? <Text style={local.error}>{mfa.error}</Text> : null}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={cancel}>Cancel</Button>
            <Button onPress={submitEnroll} loading={mfa.busy} disabled={!mfa.canSubmit}>
              Confirm
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={mfa.mode === 'disable'} onDismiss={cancel}>
          <Dialog.Title>Enter a current code</Dialog.Title>
          <Dialog.Content>
            <Text style={local.step}>
              Type a code from your authenticator app to confirm it&apos;s you.
            </Text>

            <View style={local.codeField}>
              <OtpInput
                value={mfa.code}
                onChangeText={mfa.setCode}
                onComplete={disable}
                disabled={mfa.busy}
                hasError={Boolean(mfa.error)}
                autoFocus
                accessibilityLabel="Current code"
              />
            </View>

            {mfa.error ? <Text style={local.error}>{mfa.error}</Text> : null}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={cancel}>Cancel</Button>
            <Button
              onPress={submitDisable}
              loading={mfa.busy}
              disabled={!mfa.canSubmit}
              textColor={theme.tokens.status.danger}
            >
              Confirm
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={mfa.mode === 'regenerate'} onDismiss={cancel}>
          <Dialog.Title>Generate new recovery codes</Dialog.Title>
          <Dialog.Content>
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
                accessibilityLabel="Current code"
              />
            </View>

            {mfa.error ? <Text style={local.error}>{mfa.error}</Text> : null}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={cancel}>Cancel</Button>
            <Button onPress={submitRegenerate} loading={mfa.busy} disabled={!mfa.canSubmit}>
              Generate
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={mfa.mode === 'codes'} onDismiss={cancel} dismissable={false}>
          <Dialog.Title>Save your recovery codes</Dialog.Title>
          <Dialog.Content>
            <Text style={local.step}>
              Keep these somewhere safe. Each code works once to sign in if you lose your
              authenticator. This is the only time they&apos;re shown.
            </Text>

            <View style={local.codesBox}>
              {(recoveryCodes ?? []).map((recoveryCode) => (
                <Text key={recoveryCode} selectable style={local.recoveryCode}>
                  {recoveryCode}
                </Text>
              ))}
            </View>

            <Button compact icon="content-copy" onPress={copyRecoveryCodes}>
              Copy all
            </Button>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={cancel}>Done</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}

function createLocalStyles(theme: AppTheme) {
  return StyleSheet.create({
    step: {
      fontSize: 14,
      opacity: 0.75,
      marginBottom: 16,
    },
    qrFrame: {
      alignSelf: 'center',
      padding: 16,
      borderRadius: 16,
      backgroundColor: '#ffffff',
      marginBottom: 16,
    },
    keyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      backgroundColor: theme.tokens.surface.sunken,
      borderRadius: 10,
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
    passwordField: {
      marginTop: 16,
    },
    codeField: {
      marginTop: 16,
    },
    codesBox: {
      backgroundColor: theme.tokens.surface.sunken,
      borderRadius: 10,
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
  });
}

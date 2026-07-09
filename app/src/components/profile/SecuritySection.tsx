import { useCallback } from 'react';
import { View } from 'react-native';
import { Icon } from 'react-native-paper';
import { Text } from '@/components/base/Text';
import { useMfaSetup } from '@/features/profile/useMfaSetup';
import { useAppTheme } from '@/theme';
import { MfaDialogs } from './MfaDialogs';
import { ProfileAction, ProfileSectionHeader } from './shared';
import { createProfileSectionStyles } from './styles';

type ProfileSecuritySectionProps = {
  mfaEnabled: boolean;
  onEnrolled: () => unknown;
};

export function ProfileSecuritySection({ mfaEnabled, onEnrolled }: ProfileSecuritySectionProps) {
  const theme = useAppTheme();
  const styles = createProfileSectionStyles(theme);
  const mfa = useMfaSetup(onEnrolled);

  const { start, beginDisable, beginRegenerate } = mfa;
  const beginReset = useCallback(() => beginDisable(true), [beginDisable]);
  const beginTurnOff = useCallback(() => beginDisable(false), [beginDisable]);

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

      <MfaDialogs mfa={mfa} />
    </>
  );
}

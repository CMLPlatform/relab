import { useCallback, useRef } from 'react';
import { View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { Icon } from '@/components/base/Icon';
import { useMfaSetup } from '@/features/profile/useMfaSetup';
import { useAppTheme } from '@/theme';
import { MfaDialogs } from './MfaDialogs';
import { ProfileAction } from './shared';
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
  const enrollTriggerRef = useRef<View>(null);
  const regenerateTriggerRef = useRef<View>(null);
  const resetTriggerRef = useRef<View>(null);
  const turnOffTriggerRef = useRef<View>(null);
  // 'disable' mode has two entry points (reset vs turn-off); this tracks whichever
  // was pressed most recently, since useReturnFocus needs one settled ref per dialog.
  const disableTriggerRef = useRef<View>(null);
  const beginReset = useCallback(() => {
    disableTriggerRef.current = resetTriggerRef.current;
    beginDisable(true);
  }, [beginDisable]);
  const beginTurnOff = useCallback(() => {
    disableTriggerRef.current = turnOffTriggerRef.current;
    beginDisable(false);
  }, [beginDisable]);

  return (
    <>
      <View className="mx-1">
        {mfaEnabled ? (
          <>
            <View className="flex-row items-center justify-between px-4 py-2.5">
              <View className="flex-1">
                <AppText className="font-semibold">Two-step verification</AppText>
                <AppText className="mt-px opacity-[0.55]" style={styles.actionSubtitle}>
                  On — you enter a code at login
                </AppText>
              </View>
              <Icon name="circle-check-big" size={22} color={theme.tokens.status.success} />
            </View>
            <ProfileAction
              title="Generate new recovery codes"
              subtitle="Replace your saved backup codes"
              onPress={beginRegenerate}
              triggerRef={regenerateTriggerRef}
            />
            <ProfileAction
              title="Reset authenticator key"
              subtitle="Swap to a new authenticator app"
              onPress={beginReset}
              triggerRef={resetTriggerRef}
            />
            <ProfileAction
              title="Turn off two-step verification"
              subtitle="Sign in with just your password"
              onPress={beginTurnOff}
              titleStyle={styles.danger}
              triggerRef={turnOffTriggerRef}
            />
          </>
        ) : (
          <ProfileAction
            title="Two-step verification"
            subtitle={mfa.starting ? 'Preparing…' : 'Protect logins with an authenticator app'}
            onPress={start}
            triggerRef={enrollTriggerRef}
          />
        )}
      </View>

      <MfaDialogs
        mfa={mfa}
        enrollTriggerRef={enrollTriggerRef}
        disableTriggerRef={disableTriggerRef}
        regenerateTriggerRef={regenerateTriggerRef}
      />
    </>
  );
}

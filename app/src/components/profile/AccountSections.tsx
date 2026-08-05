import { type RefObject, useCallback, useRef } from 'react';
import { View } from 'react-native';
import { useAppTheme } from '@/theme';
import { type OAuthAccount, ProfileAction } from './shared';
import { createProfileSectionStyles } from './styles';

type ProfileAccountSectionProps = {
  isVerified: boolean;
  onLogout: () => void;
  onRevokeAllSessions: () => void;
  onVerifyAccount: () => void;
  logoutTriggerRef?: RefObject<View | null>;
};

export function ProfileAccountSection({
  isVerified,
  onLogout,
  onRevokeAllSessions,
  onVerifyAccount,
  logoutTriggerRef,
}: ProfileAccountSectionProps) {
  const styles = createProfileSectionStyles(useAppTheme());
  return (
    <View style={styles.section}>
      <ProfileAction
        title="Sign out"
        subtitle="Switch to another account"
        onPress={onLogout}
        titleStyle={styles.danger}
        triggerRef={logoutTriggerRef}
      />
      <ProfileAction
        title="Sign out everywhere"
        subtitle="End all active sessions for this account"
        onPress={onRevokeAllSessions}
        titleStyle={styles.danger}
      />
      {!isVerified ? (
        <ProfileAction
          title="Verify email address"
          subtitle="Resend the verification email"
          onPress={onVerifyAccount}
        />
      ) : null}
    </View>
  );
}

type ProfileLinkedAccountsSectionProps = {
  isGoogleLinked: boolean;
  isGithubLinked: boolean;
  googleAccount?: OAuthAccount | null;
  githubAccount?: OAuthAccount | null;
  onLinkOAuth: (provider: 'google' | 'github') => void;
  onRequestUnlink: (provider: 'google' | 'github') => void;
  /** Both "Unlink X" buttons open the same dialog — this tracks whichever was pressed last. */
  unlinkTriggerRef?: RefObject<View | null>;
};

export function ProfileLinkedAccountsSection({
  isGoogleLinked,
  isGithubLinked,
  googleAccount,
  githubAccount,
  onLinkOAuth,
  onRequestUnlink,
  unlinkTriggerRef,
}: ProfileLinkedAccountsSectionProps) {
  const styles = createProfileSectionStyles(useAppTheme());
  const unlinkGoogleNodeRef = useRef<View>(null);
  const unlinkGithubNodeRef = useRef<View>(null);
  const unlinkGoogle = useCallback(() => {
    if (unlinkTriggerRef) unlinkTriggerRef.current = unlinkGoogleNodeRef.current;
    onRequestUnlink('google');
  }, [onRequestUnlink, unlinkTriggerRef]);
  const linkGoogle = useCallback(() => onLinkOAuth('google'), [onLinkOAuth]);
  const unlinkGithub = useCallback(() => {
    if (unlinkTriggerRef) unlinkTriggerRef.current = unlinkGithubNodeRef.current;
    onRequestUnlink('github');
  }, [onRequestUnlink, unlinkTriggerRef]);
  const linkGithub = useCallback(() => onLinkOAuth('github'), [onLinkOAuth]);
  return (
    <View style={styles.section}>
      {isGoogleLinked ? (
        <ProfileAction
          title="Unlink Google"
          subtitle={`Connected as ${googleAccount?.account_email ?? ''}`}
          onPress={unlinkGoogle}
          titleStyle={styles.danger}
          triggerRef={unlinkGoogleNodeRef}
        />
      ) : (
        <ProfileAction
          title="Link Google account"
          subtitle="Continue with Google"
          onPress={linkGoogle}
        />
      )}

      {isGithubLinked ? (
        <ProfileAction
          title="Unlink GitHub"
          subtitle={`Connected as ${githubAccount?.account_email ?? ''}`}
          onPress={unlinkGithub}
          titleStyle={styles.danger}
          triggerRef={unlinkGithubNodeRef}
        />
      ) : (
        <ProfileAction
          title="Link GitHub account"
          subtitle="Continue with GitHub"
          onPress={linkGithub}
        />
      )}
    </View>
  );
}

type ProfileDangerZoneSectionProps = {
  onDeleteAccount: () => void;
  triggerRef?: RefObject<View | null>;
};

export function ProfileDangerZoneSection({
  onDeleteAccount,
  triggerRef,
}: ProfileDangerZoneSectionProps) {
  const styles = createProfileSectionStyles(useAppTheme());
  return (
    <View style={[styles.section, styles.dangerSection]}>
      <ProfileAction
        title="Delete account?"
        onPress={onDeleteAccount}
        titleStyle={{ ...styles.danger, fontSize: 15 }}
        hideChevron
        triggerRef={triggerRef}
      />
    </View>
  );
}

import { View } from 'react-native';
import { createProfileSectionStyles } from '@/components/profile/sections/styles';
import { useAppTheme } from '@/theme';
import { type OAuthAccount, ProfileAction, ProfileSectionHeader } from './shared';

type ProfileAccountSectionProps = {
  isVerified: boolean;
  onLogout: () => void;
  onRevokeAllSessions: () => void;
  onVerifyAccount: () => void;
};

export function ProfileAccountSection({
  isVerified,
  onLogout,
  onRevokeAllSessions,
  onVerifyAccount,
}: ProfileAccountSectionProps) {
  const styles = createProfileSectionStyles(useAppTheme());
  return (
    <>
      <ProfileSectionHeader title="Account" />
      <View style={styles.section}>
        <ProfileAction
          title="Logout"
          subtitle="Switch to another account"
          onPress={onLogout}
          titleStyle={styles.danger}
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
    </>
  );
}

type ProfileLinkedAccountsSectionProps = {
  isGoogleLinked: boolean;
  isGithubLinked: boolean;
  googleAccount?: OAuthAccount | null;
  githubAccount?: OAuthAccount | null;
  onLinkOAuth: (provider: 'google' | 'github') => void;
  onRequestUnlink: (provider: 'google' | 'github') => void;
};

export function ProfileLinkedAccountsSection({
  isGoogleLinked,
  isGithubLinked,
  googleAccount,
  githubAccount,
  onLinkOAuth,
  onRequestUnlink,
}: ProfileLinkedAccountsSectionProps) {
  const styles = createProfileSectionStyles(useAppTheme());
  return (
    <>
      <ProfileSectionHeader title="Linked Accounts" />
      <View style={styles.section}>
        {isGoogleLinked ? (
          <ProfileAction
            title="Unlink Google"
            subtitle={`Connected as ${googleAccount?.account_email ?? ''}`}
            onPress={() => onRequestUnlink('google')}
            titleStyle={styles.danger}
          />
        ) : (
          <ProfileAction
            title="Link Google Account"
            subtitle="Continue with Google"
            onPress={() => onLinkOAuth('google')}
          />
        )}

        {isGithubLinked ? (
          <ProfileAction
            title="Unlink GitHub"
            subtitle={`Connected as ${githubAccount?.account_email ?? ''}`}
            onPress={() => onRequestUnlink('github')}
            titleStyle={styles.danger}
          />
        ) : (
          <ProfileAction
            title="Link GitHub Account"
            subtitle="Continue with GitHub"
            onPress={() => onLinkOAuth('github')}
          />
        )}
      </View>
    </>
  );
}

type ProfileDangerZoneSectionProps = {
  onDeleteAccount: () => void;
};

export function ProfileDangerZoneSection({ onDeleteAccount }: ProfileDangerZoneSectionProps) {
  const styles = createProfileSectionStyles(useAppTheme());
  return (
    <>
      <ProfileSectionHeader title="Danger Zone" />
      <View style={[styles.section, styles.dangerSection]}>
        <ProfileAction
          title="Delete Account?"
          onPress={onDeleteAccount}
          titleStyle={{ ...styles.danger, fontSize: 15 }}
          hideChevron
        />
      </View>
    </>
  );
}

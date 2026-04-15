import { View } from 'react-native';
import { Button, Switch } from 'react-native-paper';
import { Text } from '@/components/base/Text';
import {
  type OAuthAccount,
  ProfileAction,
  ProfileSectionHeader,
  profileSectionStyles as styles,
} from './shared';

type ProfileAccountSectionProps = {
  isVerified: boolean;
  onLogout: () => void;
  onVerifyAccount: () => void;
};

export function ProfileAccountSection({
  isVerified,
  onLogout,
  onVerifyAccount,
}: ProfileAccountSectionProps) {
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

type ProfileNewsletterSectionProps = {
  newsletterSubscribed: boolean;
  newsletterLoading: boolean;
  newsletterSaving: boolean;
  newsletterError: string;
  onToggleNewsletter: (enabled: boolean) => void;
  onReloadNewsletterPreference: () => void;
};

export function ProfileNewsletterSection({
  newsletterSubscribed,
  newsletterLoading,
  newsletterSaving,
  newsletterError,
  onToggleNewsletter,
  onReloadNewsletterPreference,
}: ProfileNewsletterSectionProps) {
  return (
    <>
      <ProfileSectionHeader title="Email updates" />
      <View style={styles.section}>
        <View style={styles.newsletterRow}>
          <View style={styles.newsletterCopy}>
            <Text style={styles.actionTitle}>Product updates</Text>
            <Text style={styles.actionSubtitle}>
              Occasional research and product emails, separate from your account.
            </Text>
            <Text style={styles.newsletterState}>
              {newsletterLoading
                ? 'Checking your preference...'
                : newsletterSubscribed
                  ? 'You are subscribed.'
                  : 'You are not subscribed.'}
            </Text>
          </View>
          <Switch
            testID="newsletter-switch"
            value={newsletterSubscribed}
            onValueChange={onToggleNewsletter}
            disabled={newsletterLoading || newsletterSaving}
          />
        </View>
        <View style={styles.newsletterFooter}>
          {newsletterError ? <Text style={styles.newsletterError}>{newsletterError}</Text> : null}
          {newsletterError ? (
            <Button
              mode="text"
              compact
              onPress={onReloadNewsletterPreference}
              disabled={newsletterLoading || newsletterSaving}
            >
              Try again
            </Button>
          ) : null}
        </View>
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

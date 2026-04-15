import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import {
  ProfileAccountSection,
  ProfileAppearanceSection,
  ProfileDangerZoneSection,
  ProfileDialogs,
  ProfileHero,
  ProfileIntegrationsSection,
  ProfileLayout,
  ProfileLinkedAccountsSection,
  ProfileNewsletterSection,
  ProfileStatsSection,
  ProfileVisibilitySection,
} from '@/components/profile/ProfileScreenSections';
import { useProfileScreen } from '@/hooks/useProfileScreen';

WebBrowser.maybeCompleteAuthSession({ skipRedirectCheck: true });

export default function ProfileTab() {
  const router = useRouter();
  const { profile, integrations, newsletter, dialogs, actions } = useProfileScreen();

  if (!profile.profile) return null;

  return (
    <ProfileLayout>
      <ProfileHero profile={profile.profile} onEditUsername={profile.openEditUsername} />

      <ProfileStatsSection ownStats={profile.ownStats} statsLoading={profile.statsLoading} />

      <ProfileIntegrationsSection
        rpiEnabled={integrations.rpiEnabled}
        rpiLoading={integrations.rpiLoading}
        onSetRpiEnabled={(value) => void integrations.setRpiEnabled(value)}
        onManageCameras={() => router.push('/cameras')}
        youtubeEnabled={integrations.youtubeEnabled}
        youtubeLoading={integrations.youtubeLoading}
        youtubeAuthPending={integrations.youtubeAuthPending}
        onToggleYouTube={(value) => void integrations.handleYouTubeToggle(value)}
      />

      <ProfileAppearanceSection
        themeMode={profile.themeMode}
        onSetThemeMode={(mode) => void profile.setThemeMode(mode)}
      />

      <ProfileVisibilitySection
        profile={profile.profile}
        visibilitySaving={profile.visibilitySaving}
        onChangeVisibility={(visibility) => void profile.handleVisibilityChange(visibility)}
      />

      <ProfileAccountSection
        isVerified={profile.profile.isVerified}
        onLogout={actions.onLogout}
        onVerifyAccount={actions.onVerifyAccount}
      />

      <ProfileNewsletterSection
        newsletterSubscribed={newsletter.newsletterSubscribed}
        newsletterLoading={newsletter.newsletterLoading}
        newsletterSaving={newsletter.newsletterSaving}
        newsletterError={newsletter.newsletterError}
        onToggleNewsletter={newsletter.handleNewsletterToggle}
        onReloadNewsletterPreference={() => {
          void newsletter.loadNewsletterPreference();
        }}
      />

      <ProfileLinkedAccountsSection
        isGoogleLinked={integrations.isGoogleLinked}
        isGithubLinked={integrations.isGithubLinked}
        googleAccount={integrations.googleAccount}
        githubAccount={integrations.githubAccount}
        onLinkOAuth={(provider) => {
          void integrations.handleLinkOAuth(provider);
        }}
        onRequestUnlink={dialogs.unlinkDialog.request}
      />

      <ProfileDangerZoneSection onDeleteAccount={dialogs.deleteDialog.open} />

      <ProfileDialogs
        editUsernameVisible={dialogs.editUsername.visible}
        onDismissEditUsername={dialogs.editUsername.close}
        newUsername={dialogs.editUsername.value}
        onChangeUsername={dialogs.editUsername.setValue}
        onSaveUsername={() => {
          void actions.handleUpdateUsername();
        }}
        unlinkDialogVisible={dialogs.unlinkDialog.visible}
        onDismissUnlink={dialogs.unlinkDialog.close}
        providerToUnlink={dialogs.unlinkDialog.provider}
        onConfirmUnlink={() => {
          void integrations.handleUnlinkOAuthConfirm();
        }}
        logoutDialogVisible={dialogs.logoutDialog.visible}
        onDismissLogout={dialogs.logoutDialog.close}
        onConfirmLogout={actions.confirmLogout}
        deleteDialogVisible={dialogs.deleteDialog.visible}
        onDismissDeleteDialog={dialogs.deleteDialog.close}
      />
    </ProfileLayout>
  );
}

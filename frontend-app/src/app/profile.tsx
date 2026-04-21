import { useRouter } from 'expo-router';
import { maybeCompleteAuthSession } from 'expo-web-browser';
import {
  ProfileAccountSection,
  ProfileDangerZoneSection,
  ProfileLinkedAccountsSection,
  ProfileNewsletterSection,
} from '@/components/profile/sections/AccountSections';
import { ProfileDialogs } from '@/components/profile/sections/Dialogs';
import { ProfileHero, ProfileStatsSection } from '@/components/profile/sections/HeroStats';
import { ProfileIntegrationsSection } from '@/components/profile/sections/Integrations';
import {
  ProfileAppearanceSection,
  ProfileVisibilitySection,
} from '@/components/profile/sections/Preferences';
import { ProfileLayout } from '@/components/profile/sections/shared';
import { useProfileScreen } from '@/hooks/profile/useProfileScreen';

maybeCompleteAuthSession({ skipRedirectCheck: true });

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
        onSetRpiEnabled={integrations.setRpiEnabled}
        onManageCameras={() => router.push('/cameras')}
        youtubeEnabled={integrations.youtubeEnabled}
        youtubeLoading={integrations.youtubeLoading}
        youtubeAuthPending={integrations.youtubeAuthPending}
        onToggleYouTube={integrations.handleYouTubeToggle}
      />

      <ProfileAppearanceSection
        themeMode={profile.themeMode}
        onSetThemeMode={profile.setThemeMode}
      />

      <ProfileVisibilitySection
        profile={profile.profile}
        visibilitySaving={profile.visibilitySaving}
        onChangeVisibility={profile.handleVisibilityChange}
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
        onReloadNewsletterPreference={newsletter.loadNewsletterPreference}
      />

      <ProfileLinkedAccountsSection
        isGoogleLinked={integrations.isGoogleLinked}
        isGithubLinked={integrations.isGithubLinked}
        googleAccount={integrations.googleAccount}
        githubAccount={integrations.githubAccount}
        onLinkOAuth={integrations.handleLinkOAuth}
        onRequestUnlink={dialogs.unlinkDialog.request}
      />

      <ProfileDangerZoneSection onDeleteAccount={dialogs.deleteDialog.open} />

      <ProfileDialogs
        editUsernameVisible={dialogs.editUsername.visible}
        onDismissEditUsername={dialogs.editUsername.close}
        newUsername={dialogs.editUsername.value}
        onChangeUsername={dialogs.editUsername.setValue}
        onSaveUsername={actions.handleUpdateUsername}
        unlinkDialogVisible={dialogs.unlinkDialog.visible}
        onDismissUnlink={dialogs.unlinkDialog.close}
        providerToUnlink={dialogs.unlinkDialog.provider}
        onConfirmUnlink={integrations.handleUnlinkOAuthConfirm}
        logoutDialogVisible={dialogs.logoutDialog.visible}
        onDismissLogout={dialogs.logoutDialog.close}
        onConfirmLogout={actions.confirmLogout}
        deleteDialogVisible={dialogs.deleteDialog.visible}
        onDismissDeleteDialog={dialogs.deleteDialog.close}
      />
    </ProfileLayout>
  );
}

// Canonical home of ACCOUNT_SECTIONS — do not re-export a component from this
// file (react-refresh/only-export-components forbids mixing non-component
// exports into a file that also exports a component).
import type { ReactNode, RefObject } from 'react';
import type { View } from 'react-native';
import {
  ProfileAccountSection,
  ProfileDangerZoneSection,
  ProfileLinkedAccountsSection,
} from '@/components/profile/AccountSections';
import { ProfileIntegrationsSection } from '@/components/profile/Integrations';
import {
  ProfileAppearanceSection,
  ProfileEmailUpdatesSection,
  ProfileVisibilitySection,
} from '@/components/profile/Preferences';
import { ProfileSecuritySection } from '@/components/profile/SecuritySection';
import type { useProfileScreen } from '@/features/profile/useProfileScreen';

export type AccountSectionKey = 'preferences' | 'integrations' | 'security' | 'danger';

export type AccountSectionContext = ReturnType<typeof useProfileScreen> & {
  onManageCameras: () => void;
  onRefetchAuth: () => void;
  /** Return-focus targets for the corresponding dialogs; see AppDialog's `triggerRef`. */
  logoutTriggerRef: RefObject<View | null>;
  deleteAccountTriggerRef: RefObject<View | null>;
  unlinkTriggerRef: RefObject<View | null>;
};

export type AccountSectionDef = {
  key: AccountSectionKey;
  label: string;
  title: string;
  render: (ctx: AccountSectionContext) => ReactNode;
};

// NOTE: profile.profile is typed User | undefined by useProfileScreen, but
// the screen (today: AccountScreen.tsx's `if (!profile.profile) return null`)
// never invokes render() before that guard passes — the `return null` guards
// below just satisfy that type, they never trigger in practice.
export const ACCOUNT_SECTIONS: AccountSectionDef[] = [
  {
    key: 'preferences',
    label: 'Preferences',
    title: 'Preferences',
    render: ({ profile }) => {
      if (!profile.profile) return null;
      return (
        <>
          <ProfileAppearanceSection
            themeMode={profile.themeMode}
            onSetThemeMode={profile.setThemeMode}
          />
          <ProfileVisibilitySection
            profile={profile.profile}
            visibilitySaving={profile.visibilitySaving}
            onChangeVisibility={profile.handleVisibilityChange}
          />
          <ProfileEmailUpdatesSection
            enabled={profile.emailUpdatesEnabled}
            saving={profile.emailUpdatesSaving}
            onSetEnabled={profile.handleEmailUpdatesChange}
          />
        </>
      );
    },
  },
  {
    key: 'integrations',
    label: 'Integrations',
    title: 'Integrations',
    render: ({ integrations, onManageCameras }) => (
      <ProfileIntegrationsSection
        rpiEnabled={integrations.rpiEnabled}
        rpiLoading={integrations.rpiLoading}
        onSetRpiEnabled={integrations.setRpiEnabled}
        onManageCameras={onManageCameras}
        youtubeEnabled={integrations.youtubeEnabled}
        youtubeLoading={integrations.youtubeLoading}
        youtubeAuthPending={integrations.youtubeAuthPending}
        onToggleYouTube={integrations.handleYouTubeToggle}
      />
    ),
  },
  {
    key: 'security',
    label: 'Security & sessions',
    title: 'Security & sessions',
    render: ({
      profile,
      integrations,
      dialogs,
      actions,
      onRefetchAuth,
      logoutTriggerRef,
      unlinkTriggerRef,
    }) => {
      if (!profile.profile) return null;
      return (
        <>
          <ProfileAccountSection
            isVerified={profile.profile.isVerified}
            onLogout={actions.onLogout}
            onRevokeAllSessions={actions.onRevokeAllSessions}
            onVerifyAccount={actions.onVerifyAccount}
            logoutTriggerRef={logoutTriggerRef}
          />
          <ProfileSecuritySection
            mfaEnabled={profile.profile.mfaEnabled}
            onEnrolled={onRefetchAuth}
          />
          <ProfileLinkedAccountsSection
            isGoogleLinked={integrations.isGoogleLinked}
            isGithubLinked={integrations.isGithubLinked}
            googleAccount={integrations.googleAccount}
            githubAccount={integrations.githubAccount}
            onLinkOAuth={integrations.handleLinkOAuth}
            onRequestUnlink={dialogs.unlinkDialog.request}
            unlinkTriggerRef={unlinkTriggerRef}
          />
        </>
      );
    },
  },
  {
    key: 'danger',
    label: 'Danger zone',
    title: 'Danger zone',
    render: ({ dialogs, deleteAccountTriggerRef }) => (
      <ProfileDangerZoneSection
        onDeleteAccount={dialogs.deleteDialog.open}
        triggerRef={deleteAccountTriggerRef}
      />
    ),
  },
];

import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useCallback, useContext, useRef } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollView } from 'react-native';
import { View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { CenteredSpinner } from '@/components/base/CenteredSpinner';
import { PageContainer } from '@/components/base/PageContainer';
import { Section } from '@/components/base/Section';
import { SectionNavContext } from '@/components/base/SectionNavContext';
import { SectionNavLayout } from '@/components/base/SectionNavLayout';
import { useAuth } from '@/context/auth';
import { ACCOUNT_SECTIONS, type AccountSectionContext } from '@/features/profile/accountSections';
import { useProfileScreen } from '@/features/profile/useProfileScreen';
import { useAnchoredSectionNav } from '@/hooks/useAnchoredSectionNav';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useSectionNav } from '@/hooks/useSectionNav';
import type { User } from '@/types/User';
import { ProfileDialogs } from './Dialogs';
import { ProfileHero, ProfileStatsSection } from './HeroStats';

const DANGER_ZONE_KEY = 'danger';

/** Scrollable document body: hero header plus the grouped sections, anchored via useAnchoredSectionNav. */
function AccountBody({ ctx, profile }: { ctx: AccountSectionContext; profile: User }) {
  const outerNav = useContext(SectionNavContext);
  const {
    value: anchoredNav,
    onPageContainerLayout,
    onSectionsWrapperLayout,
  } = useAnchoredSectionNav(outerNav);

  return (
    <>
      <Head>
        <title>Account · Relab</title>
      </Head>
      <PageContainer onLayout={onPageContainerLayout}>
        <View style={{ gap: 15 }} onLayout={onSectionsWrapperLayout}>
          <ProfileHero
            profile={profile}
            onEditUsername={ctx.profile.openEditUsername}
            usernameEditTriggerRef={ctx.profile.usernameEditTriggerRef}
          />
          <ProfileStatsSection
            ownStats={ctx.profile.ownStats}
            statsLoading={ctx.profile.statsLoading}
          />
          <SectionNavContext.Provider value={anchoredNav}>
            {ACCOUNT_SECTIONS.map((section) => (
              <Section
                key={section.key}
                sectionKey={section.key}
                title={section.title}
                // Section must stay a direct child of this wrapper (not nested
                // in a per-item View) — see its className prop doc.
                className={
                  section.key === DANGER_ZONE_KEY ? 'mt-6 border-t border-border pt-6' : undefined
                }
              >
                {section.render(ctx)}
              </Section>
            ))}
          </SectionNavContext.Provider>
        </View>
      </PageContainer>
    </>
  );
}

export function AccountScreen() {
  const router = useRouter();
  const { refetch } = useAuth();
  const profileScreen = useProfileScreen();
  const { profile, integrations, dialogs, actions } = profileScreen;
  const { isLg } = useBreakpoint();
  const scrollRef = useRef<ScrollView>(null);
  const nav = useSectionNav((y) => scrollRef.current?.scrollTo({ y, animated: true }));
  const goToCameras = useCallback(() => router.navigate('/cameras'), [router]);
  const logoutTriggerRef = useRef<View>(null);
  const deleteAccountTriggerRef = useRef<View>(null);
  const unlinkTriggerRef = useRef<View>(null);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      nav.onScrollSpy(event.nativeEvent.contentOffset.y);
    },
    [nav],
  );

  // Only hit for the one-render window before useRequireAuth's redirect completes.
  if (!profile.profile) return <CenteredSpinner />;

  const navSections = ACCOUNT_SECTIONS.map((section) => ({
    key: section.key,
    label: section.label,
  }));
  const ctx: AccountSectionContext = {
    ...profileScreen,
    onManageCameras: goToCameras,
    onRefetchAuth: refetch,
    logoutTriggerRef,
    deleteAccountTriggerRef,
    unlinkTriggerRef,
  };

  return (
    <SectionNavContext.Provider value={nav}>
      <SectionNavLayout
        isLg={isLg}
        navSections={navSections}
        activeKey={nav.activeKey}
        onPressSection={nav.scrollTo}
      >
        <KeyboardAwareScrollView
          // KeyboardAwareScrollView forwards the real ScrollView instance; the
          // two ref shapes are runtime-compatible.
          ref={scrollRef as never}
          contentContainerStyle={{ gap: 15, paddingBottom: 40 }}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        >
          <AccountBody ctx={ctx} profile={profile.profile} />
        </KeyboardAwareScrollView>
      </SectionNavLayout>

      <ProfileDialogs
        unlinkDialogVisible={dialogs.unlinkDialog.visible}
        onDismissUnlink={dialogs.unlinkDialog.close}
        providerToUnlink={dialogs.unlinkDialog.provider}
        onConfirmUnlink={integrations.handleUnlinkOAuthConfirm}
        isLastLinkedProvider={integrations.isLastLinkedProvider}
        unlinkRequiresPassword={profile.profile.hasUsablePassword}
        unlinkPassword={dialogs.unlinkDialog.password}
        onChangeUnlinkPassword={dialogs.unlinkDialog.setPassword}
        logoutDialogVisible={dialogs.logoutDialog.visible}
        onDismissLogout={dialogs.logoutDialog.close}
        onConfirmLogout={actions.confirmLogout}
        deleteDialogVisible={dialogs.deleteDialog.visible}
        onDismissDeleteDialog={dialogs.deleteDialog.close}
        unlinkTriggerRef={unlinkTriggerRef}
        logoutTriggerRef={logoutTriggerRef}
        deleteAccountTriggerRef={deleteAccountTriggerRef}
      />
    </SectionNavContext.Provider>
  );
}

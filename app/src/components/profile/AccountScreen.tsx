import { useRouter } from 'expo-router';
import { useCallback, useContext, useRef } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollView } from 'react-native';
import { View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
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
import { ProfileHero } from './HeroStats';

const DANGER_ZONE_KEY = 'danger';

/**
 * The scrollable document body: hero header + the five grouped sections.
 * Registers each section's position through the same base-offset composition
 * as the product detail screen's Content.tsx (useAnchoredSectionNav) — the
 * outer nav context supplies raw scroll-content coordinates once the
 * PageContainer/sections-wrapper layouts land, so anchors stay correct
 * regardless of onLayout firing order.
 */
function AccountBody({ ctx, profile }: { ctx: AccountSectionContext; profile: User }) {
  const outerNav = useContext(SectionNavContext);
  const {
    value: anchoredNav,
    onPageContainerLayout,
    onSectionsWrapperLayout,
  } = useAnchoredSectionNav(outerNav);

  return (
    <PageContainer onLayout={onPageContainerLayout}>
      <View style={{ gap: 15 }} onLayout={onSectionsWrapperLayout}>
        <ProfileHero profile={profile} onEditUsername={ctx.profile.openEditUsername} />
        <SectionNavContext.Provider value={anchoredNav}>
          {ACCOUNT_SECTIONS.map((section) => (
            <View
              key={section.key}
              className={
                section.key === DANGER_ZONE_KEY ? 'mt-6 border-t border-border pt-6' : undefined
              }
            >
              <Section sectionKey={section.key} title={section.title}>
                {section.render(ctx)}
              </Section>
            </View>
          ))}
        </SectionNavContext.Provider>
      </View>
    </PageContainer>
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
  const goToCameras = useCallback(() => router.push('/cameras'), [router]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      nav.onScrollSpy(event.nativeEvent.contentOffset.y);
    },
    [nav],
  );

  if (!profile.profile) return null;

  const navSections = ACCOUNT_SECTIONS.map((section) => ({
    key: section.key,
    label: section.label,
  }));
  const ctx: AccountSectionContext = {
    ...profileScreen,
    onManageCameras: goToCameras,
    onRefetchAuth: refetch,
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
          // KeyboardAwareScrollView forwards the real underlying ScrollView instance
          // (see react-native-keyboard-controller source) with one extra method
          // glued on; the plain ScrollView ref type is what callers need for scrollTo.
          ref={scrollRef as never}
          contentContainerStyle={{ gap: 15, paddingBottom: 40 }}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        >
          <AccountBody ctx={ctx} profile={profile.profile} />
        </KeyboardAwareScrollView>
      </SectionNavLayout>

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
        isLastLinkedProvider={integrations.isLastLinkedProvider}
        unlinkRequiresPassword={profile.profile.hasUsablePassword}
        unlinkPassword={dialogs.unlinkDialog.password}
        onChangeUnlinkPassword={dialogs.unlinkDialog.setPassword}
        logoutDialogVisible={dialogs.logoutDialog.visible}
        onDismissLogout={dialogs.logoutDialog.close}
        onConfirmLogout={actions.confirmLogout}
        deleteDialogVisible={dialogs.deleteDialog.visible}
        onDismissDeleteDialog={dialogs.deleteDialog.close}
      />
    </SectionNavContext.Provider>
  );
}

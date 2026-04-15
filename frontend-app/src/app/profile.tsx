import * as Linking from 'expo-linking';
import { Link, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Platform, Pressable, ScrollView, StyleSheet, type TextStyle, View } from 'react-native';
import {
  Button,
  Dialog,
  Divider,
  Icon,
  Portal,
  Switch,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { Chip } from '@/components/base/Chip';
import { Text } from '@/components/base/Text';
import LogoutConfirm from '@/components/common/LogoutConfirm';
import { DOCS_URL } from '@/config';
import { useProfileScreen } from '@/hooks/useProfileScreen';
import type { ThemeMode } from '@/types/User';

WebBrowser.maybeCompleteAuthSession({ skipRedirectCheck: true });

export default function ProfileTab() {
  const router = useRouter();
  const theme = useTheme();
  const {
    profile,
    themeMode,
    setThemeMode,
    rpiEnabled,
    rpiLoading,
    setRpiEnabled,
    youtubeEnabled,
    youtubeLoading,
    youtubeAuthPending,
    newsletterSubscribed,
    newsletterLoading,
    newsletterSaving,
    newsletterError,
    ownStats,
    statsLoading,
    visibilitySaving,
    isGoogleLinked,
    isGithubLinked,
    googleAccount,
    githubAccount,
    deleteDialogVisible,
    setDeleteDialogVisible,
    logoutDialogVisible,
    setLogoutDialogVisible,
    editUsernameVisible,
    setEditUsernameVisible,
    newUsername,
    setNewUsername,
    unlinkDialogVisible,
    setUnlinkDialogVisible,
    providerToUnlink,
    setProviderToUnlink,
    onLogout,
    confirmLogout,
    onVerifyAccount,
    handleUpdateUsername,
    handleUnlinkOAuthConfirm,
    handleYouTubeToggle,
    handleLinkOAuth,
    handleNewsletterToggle,
    loadNewsletterPreference,
    handleVisibilityChange,
    openEditUsername,
  } = useProfileScreen();

  if (!profile) return null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* ── Hero section ── */}
      <View style={styles.hero}>
        <Text style={styles.hiText}>Hi,</Text>
        <Pressable
          onPress={openEditUsername}
          accessibilityRole="button"
          accessibilityLabel="Edit username"
        >
          <Text
            style={styles.usernameText}
            numberOfLines={Platform.OS === 'web' ? undefined : 1}
            adjustsFontSizeToFit
          >
            {`${profile.username}.`}
          </Text>
        </Pressable>

        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{profile.email}</Text>
        </View>

        <View style={styles.chipRow}>
          {profile.isActive ? <Chip>Active</Chip> : <Chip style={styles.greyChip}>Inactive</Chip>}
          {profile.isSuperuser && <Chip>Superuser</Chip>}
          {profile.isVerified ? (
            <Chip>Verified</Chip>
          ) : (
            <Chip style={styles.greyChip}>Unverified</Chip>
          )}
        </View>
      </View>

      {/* ── Stats section ── */}
      <SectionHeader title="Your Stats" />
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {statsLoading ? '...' : (ownStats?.product_count ?? 0)}
          </Text>
          <Text style={styles.statLabel}>Products</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {statsLoading ? '...' : (ownStats?.image_count ?? 0)}
          </Text>
          <Text style={styles.statLabel}>Photos</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {statsLoading ? '...' : (ownStats?.total_weight_kg ?? 0)}
          </Text>
          <Text style={styles.statLabel}>Weight (kg)</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue} numberOfLines={1}>
            {statsLoading ? '...' : (ownStats?.top_category ?? 'None')}
          </Text>
          <Text style={styles.statLabel}>Top Category</Text>
        </View>
      </View>

      {/* ── Integrations section ── */}
      <SectionHeader title="Integrations" />
      <View style={styles.section}>
        {/* RPi camera toggle */}
        <View style={styles.rpiRow}>
          <View style={styles.rpiIcon}>
            <Icon source="camera-wireless" size={22} color="#555" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>RPi Camera</Text>
            <Text style={styles.actionSubtitle}>
              Capture images with a Raspberry Pi camera during disassembly.{' '}
              <Text
                style={styles.docsLink}
                onPress={() => Linking.openURL(`${DOCS_URL}/user-guides/rpi-cam`)}
              >
                Learn more
              </Text>
            </Text>
          </View>
          <Switch
            value={rpiEnabled}
            onValueChange={(v) => void setRpiEnabled(v)}
            disabled={rpiLoading}
          />
        </View>
        {rpiEnabled && (
          <ProfileAction
            title="Manage Cameras"
            subtitle="Add, edit, or remove connected cameras"
            onPress={() => router.push('/cameras')}
          />
        )}
        {rpiEnabled && (
          <View style={styles.rpiRow}>
            <View style={styles.rpiIcon}>
              <Icon source="youtube" size={22} color="#555" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.actionTitle}>YouTube Live</Text>
              <Text style={styles.actionSubtitle}>
                {youtubeAuthPending
                  ? 'Connecting to Google…'
                  : 'Stream product sessions live to YouTube.'}
              </Text>
            </View>
            <Switch
              value={youtubeEnabled}
              onValueChange={(v) => void handleYouTubeToggle(v)}
              disabled={youtubeLoading || youtubeAuthPending}
            />
          </View>
        )}
      </View>

      {/* ── Appearance section ── */}
      <SectionHeader title="Appearance" />
      <View style={styles.section}>
        <View style={styles.themeModeRow}>
          {(
            [
              { mode: 'auto', icon: 'theme-light-dark', label: 'Auto' },
              { mode: 'light', icon: 'white-balance-sunny', label: 'Light' },
              { mode: 'dark', icon: 'moon-waning-crescent', label: 'Dark' },
            ] as const
          ).map(({ mode, icon, label }) => (
            <Pressable
              key={mode}
              style={[styles.themeModeOption, themeMode === mode && styles.themeModeOptionActive]}
              onPress={() => void setThemeMode(mode as ThemeMode)}
              accessibilityRole="radio"
              accessibilityState={{ selected: themeMode === mode }}
              accessibilityLabel={`${label} theme`}
            >
              <Icon source={icon} size={22} />
              <Text style={styles.themeModeLabel}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* ── Privacy section ── */}
      <SectionHeader title="Profile Visibility" />
      <View style={styles.section}>
        {(
          [
            {
              id: 'public',
              title: 'Public',
              subtitle: 'Visible to everyone. Best for sharing your work.',
              icon: 'earth',
            },
            {
              id: 'community',
              title: 'Community',
              subtitle: 'Only logged-in users can see your profile.',
              icon: 'account-group',
            },
            {
              id: 'private',
              title: 'Private',
              subtitle: 'Only you can see your profile. Uploads are anonymous.',
              icon: 'eye-off',
            },
          ] as const
        ).map((option) => {
          const isActive = (profile.preferences?.profile_visibility || 'public') === option.id;
          return (
            <Pressable
              key={option.id}
              style={[styles.visibilityOption, isActive && styles.visibilityOptionActive]}
              onPress={() => void handleVisibilityChange(option.id)}
              disabled={visibilitySaving}
              accessibilityRole="radio"
              accessibilityState={{ selected: isActive }}
            >
              <View style={styles.visibilityIcon}>
                <Icon
                  source={option.icon}
                  size={24}
                  color={isActive ? theme.colors.primary : '#666'}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.actionTitle, isActive && { color: theme.colors.primary }]}>
                  {option.title}
                </Text>
                <Text style={styles.actionSubtitle}>{option.subtitle}</Text>
              </View>
              {isActive && <Icon source="check" size={20} color={theme.colors.primary} />}
            </Pressable>
          );
        })}
      </View>

      {/* ── Account section ── */}
      <SectionHeader title="Account" />
      <View style={styles.section}>
        <ProfileAction
          title="Logout"
          subtitle="Switch to another account"
          onPress={onLogout}
          titleStyle={styles.danger}
        />
        {!profile.isVerified && (
          <ProfileAction
            title="Verify email address"
            subtitle="Resend the verification email"
            onPress={onVerifyAccount}
          />
        )}
      </View>

      {/* ── Email updates ── */}
      <SectionHeader title="Email updates" />
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
            onValueChange={handleNewsletterToggle}
            disabled={newsletterLoading || newsletterSaving}
          />
        </View>
        <View style={styles.newsletterFooter}>
          {newsletterError ? <Text style={styles.newsletterError}>{newsletterError}</Text> : null}
          {newsletterError ? (
            <Button
              mode="text"
              compact
              onPress={() => {
                void loadNewsletterPreference();
              }}
              disabled={newsletterLoading || newsletterSaving}
            >
              Try again
            </Button>
          ) : null}
        </View>
      </View>

      {/* ── Linked Accounts ── */}
      <SectionHeader title="Linked Accounts" />
      <View style={styles.section}>
        {isGoogleLinked ? (
          <ProfileAction
            title="Unlink Google"
            subtitle={`Connected as ${googleAccount?.account_email ?? ''}`}
            onPress={() => {
              setProviderToUnlink('google');
              setUnlinkDialogVisible(true);
            }}
            titleStyle={styles.danger}
          />
        ) : (
          <ProfileAction
            title="Link Google Account"
            subtitle="Continue with Google"
            onPress={() => handleLinkOAuth('google')}
          />
        )}
        {isGithubLinked ? (
          <ProfileAction
            title="Unlink GitHub"
            subtitle={`Connected as ${githubAccount?.account_email ?? ''}`}
            onPress={() => {
              setProviderToUnlink('github');
              setUnlinkDialogVisible(true);
            }}
            titleStyle={styles.danger}
          />
        ) : (
          <ProfileAction
            title="Link GitHub Account"
            subtitle="Continue with GitHub"
            onPress={() => handleLinkOAuth('github')}
          />
        )}
      </View>

      <SectionHeader title="Danger Zone" />
      <View style={[styles.section, { marginBottom: 40 }]}>
        <ProfileAction
          title="Delete Account?"
          onPress={() => setDeleteDialogVisible(true)}
          titleStyle={{ ...styles.danger, fontSize: 15 }}
          hideChevron
        />
      </View>

      {/* ────────── Dialogs ────────── */}
      <Portal>
        <Dialog visible={editUsernameVisible} onDismiss={() => setEditUsernameVisible(false)}>
          <Dialog.Title>Edit Username</Dialog.Title>
          <Dialog.Content>
            <TextInput
              mode="outlined"
              label="Username"
              value={newUsername}
              onChangeText={setNewUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setEditUsernameVisible(false)}>Cancel</Button>
            <Button onPress={handleUpdateUsername}>Save</Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={unlinkDialogVisible} onDismiss={() => setUnlinkDialogVisible(false)}>
          <Dialog.Title>Unlink Account</Dialog.Title>
          <Dialog.Content>
            <Text>Are you sure you want to disconnect this {providerToUnlink} account?</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setUnlinkDialogVisible(false)}>Cancel</Button>
            <Button onPress={handleUnlinkOAuthConfirm} textColor="#d32f2f">
              Unlink
            </Button>
          </Dialog.Actions>
        </Dialog>

        <LogoutConfirm
          visible={logoutDialogVisible}
          onDismiss={() => setLogoutDialogVisible(false)}
          onConfirm={confirmLogout}
        />

        <Dialog visible={deleteDialogVisible} onDismiss={() => setDeleteDialogVisible(false)}>
          <Dialog.Title>Delete Account</Dialog.Title>
          <Dialog.Content>
            <Text>
              To delete your account and all associated data, please send an email request to:
            </Text>
            <Link href="mailto:relab@cml.leidenuniv.nl">
              <Text style={{ marginTop: 10, fontWeight: 'bold' }}>relab@cml.leidenuniv.nl</Text>
            </Link>
            <Text style={{ marginTop: 10 }}>
              We&apos;ll process your request and confirm the deletion via email.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeleteDialogVisible(false)}>OK</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </ScrollView>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <>
      <Divider style={styles.divider} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </>
  );
}

function ProfileAction({
  onPress,
  title,
  subtitle,
  titleStyle,
  hideChevron = false,
}: {
  onPress: () => void;
  title: string;
  subtitle?: string;
  titleStyle?: TextStyle;
  hideChevron?: boolean;
}) {
  return (
    <Pressable
      style={styles.action}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.actionTitle, titleStyle]}>{title}</Text>
        {subtitle && <Text style={styles.actionSubtitle}>{subtitle}</Text>}
      </View>
      {!hideChevron && <Icon source="chevron-right" size={26} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 40,
  },
  hero: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 24,
  },
  hiText: {
    fontSize: 28,
    opacity: 0.6,
  },
  usernameText: {
    fontSize: Platform.OS === 'web' ? 48 : 72,
    fontWeight: 'bold',
    lineHeight: Platform.OS === 'web' ? 56 : 80,
  },
  metaRow: {
    marginTop: 16,
    gap: 4,
  },
  metaText: {
    fontSize: 15,
    opacity: 0.65,
  },
  chipRow: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  greyChip: {
    backgroundColor: 'lightgrey',
  },
  divider: {
    marginTop: 24,
    marginBottom: 4,
    marginHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    opacity: 0.45,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 2,
  },
  section: {
    marginHorizontal: 4,
  },
  rpiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 12,
  },
  rpiIcon: {
    width: 32,
    alignItems: 'center',
  },
  docsLink: {
    color: '#1565C0',
    textDecorationLine: 'underline',
  },
  newsletterRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 12,
  },
  newsletterCopy: {
    flex: 1,
  },
  newsletterState: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '600',
  },
  newsletterError: {
    paddingTop: 6,
    color: '#d32f2f',
    fontSize: 13,
  },
  newsletterFooter: {
    alignItems: 'flex-start',
    paddingHorizontal: 16,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  actionSubtitle: {
    fontSize: 13,
    opacity: 0.55,
    marginTop: 1,
  },
  themeModeRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  themeModeOption: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(128,128,128,0.2)',
  },
  themeModeOptionActive: {
    borderColor: 'rgba(128,128,128,0.5)',
    backgroundColor: 'rgba(128,128,128,0.1)',
  },
  themeModeLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  visibilityOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginVertical: 2,
  },
  visibilityOptionActive: {
    backgroundColor: 'rgba(128,128,128,0.05)',
  },
  visibilityIcon: {
    width: 32,
    alignItems: 'center',
  },
  danger: {
    color: '#d32f2f',
  },
  statsRow: {
    flexDirection: 'row',
    paddingVertical: 16,
    paddingHorizontal: 12,
    gap: 8,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    padding: 10,
    backgroundColor: 'rgba(128,128,128,0.05)',
    borderRadius: 12,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '600',
    opacity: 0.5,
    textTransform: 'uppercase',
    marginTop: 2,
  },
});

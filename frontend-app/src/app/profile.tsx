import * as Linking from 'expo-linking';
import { Link, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, type TextStyle, View } from 'react-native';
import { Button, Dialog, Divider, Icon, Portal, Switch, TextInput } from 'react-native-paper';
import { Chip } from '@/components/base/Chip';
import { Text } from '@/components/base/Text';
import LogoutConfirm from '@/components/common/LogoutConfirm';
import { API_URL, DOCS_URL } from '@/config';
import { useAuth } from '@/context/AuthProvider';
import { useThemeMode } from '@/context/ThemeModeProvider';
import { useRpiIntegration } from '@/hooks/useRpiIntegration';
import { getToken, logout, unlinkOAuth, updateUser, verify } from '@/services/api/authentication';
import { apiFetch } from '@/services/api/client';
import { getNewsletterPreference, setNewsletterPreference } from '@/services/api/newsletter';
import type { ThemeMode } from '@/types/User';

WebBrowser.maybeCompleteAuthSession({ skipRedirectCheck: true });

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export default function ProfileTab() {
  const router = useRouter();
  const { user: profile, refetch } = useAuth();

  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [logoutDialogVisible, setLogoutDialogVisible] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [editUsernameVisible, setEditUsernameVisible] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [unlinkDialogVisible, setUnlinkDialogVisible] = useState(false);
  const [providerToUnlink, setProviderToUnlink] = useState('');
  const {
    enabled: rpiEnabled,
    loading: rpiLoading,
    setEnabled: setRpiEnabled,
  } = useRpiIntegration();
  const { themeMode, setThemeMode } = useThemeMode();
  const [newsletterSubscribed, setNewsletterSubscribed] = useState(false);
  const [newsletterLoading, setNewsletterLoading] = useState(true);
  const [newsletterSaving, setNewsletterSaving] = useState(false);
  const [newsletterError, setNewsletterError] = useState('');

  // Redirect if not authenticated (but don't redirect while logging out)
  useEffect(() => {
    if (!profile && !isLoggingOut) {
      router.replace({ pathname: '/login', params: { redirectTo: '/profile' } });
    }
  }, [profile, router, isLoggingOut]);

  const onLogout = () => setLogoutDialogVisible(true);

  const confirmLogout = () => {
    setLogoutDialogVisible(false);
    setIsLoggingOut(true);
    logout()
      .then(() => {
        refetch();
        router.replace('/products');
      })
      .finally(() => setIsLoggingOut(false));
  };

  const onVerifyAccount = () => {
    if (!profile) return;
    verify(profile.email)
      .then(() => alert('Verification email sent. Please check your inbox.'))
      .catch(() => alert('Failed to send verification email. Please try again later.'));
  };

  const onDeleteAccount = () => setDeleteDialogVisible(true);
  const confirmDeleteAccount = () => setDeleteDialogVisible(false);

  const handleUpdateUsername = async () => {
    try {
      if (newUsername.length < 2) {
        alert('Username must be at least 2 characters.');
        return;
      }
      await updateUser({ username: newUsername });
      await refetch(false);
      setEditUsernameVisible(false);
    } catch (error: unknown) {
      alert(`Failed to update username: ${getErrorMessage(error, 'Unknown error')}`);
    }
  };

  const handleUnlinkOAuthConfirm = async () => {
    try {
      await unlinkOAuth(providerToUnlink);
      setUnlinkDialogVisible(false);
      refetch();
    } catch (error: unknown) {
      setUnlinkDialogVisible(false);
      alert(`Failed to disconnect: ${getErrorMessage(error, 'Unknown error')}`);
    }
  };

  const handleLinkOAuth = async (provider: 'google' | 'github') => {
    try {
      const redirectUri = Linking.createURL('/profile');
      const associateUrl = `${API_URL}/auth/oauth/${provider}/associate/authorize?redirect_uri=${encodeURIComponent(redirectUri)}`;

      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const response = await apiFetch(associateUrl, { headers });

      if (!response.ok) throw new Error('Failed to reach association endpoint.');
      const data = await response.json();

      const result = await WebBrowser.openAuthSessionAsync(data.authorization_url, redirectUri);
      if (result.type === 'success') {
        await refetch();
      }
    } catch (error: unknown) {
      alert(`Failed to start link flow: ${getErrorMessage(error, '')}`);
    }
  };

  const handleNewsletterToggle = async (nextSubscribed: boolean) => {
    if (!profile || newsletterSaving) return;

    setNewsletterSaving(true);
    setNewsletterError('');

    try {
      const preference = await setNewsletterPreference(nextSubscribed);
      setNewsletterSubscribed(preference.subscribed);
    } catch (error: unknown) {
      setNewsletterError(getErrorMessage(error, 'Unable to update email updates.'));
    } finally {
      setNewsletterSaving(false);
    }
  };

  const loadNewsletterPreference = useCallback(async () => {
    if (!profile) return;

    setNewsletterLoading(true);
    setNewsletterError('');

    try {
      const preference = await getNewsletterPreference();
      setNewsletterSubscribed(preference.subscribed);
      setNewsletterError('');
    } catch (error: unknown) {
      setNewsletterError(getErrorMessage(error, 'Unable to load email updates.'));
    } finally {
      setNewsletterLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    void loadNewsletterPreference();
  }, [loadNewsletterPreference]);

  if (!profile) return null;

  const isGoogleLinked = profile.oauth_accounts?.some((a) => a.oauth_name === 'google');
  const isGithubLinked = profile.oauth_accounts?.some((a) => a.oauth_name === 'github');
  const googleAccount = profile.oauth_accounts?.find((a) => a.oauth_name === 'google');
  const githubAccount = profile.oauth_accounts?.find((a) => a.oauth_name === 'github');

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* ── Hero section ── */}
      <View style={styles.hero}>
        <Text style={styles.hiText}>Hi,</Text>
        <Pressable
          onPress={() => {
            setNewUsername(profile.username);
            setEditUsernameVisible(true);
          }}
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
          onPress={onDeleteAccount}
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
            <Button onPress={confirmDeleteAccount}>OK</Button>
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
    fontSize: 13,
    fontWeight: '600',
  },
  danger: {
    color: '#d32f2f',
  },
});

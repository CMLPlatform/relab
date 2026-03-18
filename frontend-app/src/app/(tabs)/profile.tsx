import { Link, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextStyle, View } from 'react-native';
import { Button, Dialog, Divider, IconButton, Portal, TextInput } from 'react-native-paper';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { Chip, Text } from '@/components/base';

import { getUser, getToken, logout, verify, unlinkOAuth, updateUser } from '@/services/api/authentication';
import { User } from '@/types/User';

export default function ProfileTab() {
  const router = useRouter();

  const [profile, setProfile] = useState<User | undefined>(undefined);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [logoutDialogVisible, setLogoutDialogVisible] = useState(false);
  const [editUsernameVisible, setEditUsernameVisible] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [unlinkDialogVisible, setUnlinkDialogVisible] = useState(false);
  const [providerToUnlink, setProviderToUnlink] = useState('');

  useEffect(() => {
    getUser(true).then(setProfile);
  }, []);

  const onLogout = () => setLogoutDialogVisible(true);

  const confirmLogout = () => {
    setLogoutDialogVisible(false);
    logout().then(() => {
      setProfile(undefined);
      router.replace('/login');
    });
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
      const updatedUser = await updateUser({ username: newUsername });
      if (updatedUser) setProfile(updatedUser);
      setEditUsernameVisible(false);
    } catch (err: any) {
      alert(`Failed to update username: ${err.message}`);
    }
  };

  const handleUnlinkOAuthConfirm = async () => {
    try {
      await unlinkOAuth(providerToUnlink);
      setUnlinkDialogVisible(false);
      getUser(true).then(setProfile);
    } catch (err: any) {
      setUnlinkDialogVisible(false);
      alert(`Failed to disconnect: ${err.message}`);
    }
  };

  const handleLinkOAuth = async (provider: 'google' | 'github') => {
    try {
      const redirectUri = Linking.createURL('/profile');
      const associateUrl = `${process.env.EXPO_PUBLIC_API_URL}/auth/oauth/${provider}/associate/authorize?redirect_uri=${encodeURIComponent(redirectUri)}`;

      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(associateUrl, {
        headers,
        ...(Platform.OS === 'web' ? { credentials: 'include' } : {}),
      });

      if (!response.ok) throw new Error('Failed to reach association endpoint.');
      const data = await response.json();

      const result = await WebBrowser.openAuthSessionAsync(data.authorization_url, redirectUri);
      if (result.type === 'success') {
        getUser(true).then(setProfile);
      }
    } catch (err: any) {
      alert(`Failed to start link flow: ${err.message || ''}`);
    }
  };

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
        >
          <Text style={styles.usernameText} numberOfLines={Platform.OS === 'web' ? undefined : 1} adjustsFontSizeToFit>
            {profile.username + '.'}
          </Text>
        </Pressable>

        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{profile.email}</Text>
          <Text style={styles.idText}>ID: {profile.id}</Text>
        </View>

        <View style={styles.chipRow}>
          {profile.isActive ? <Chip>Active</Chip> : <Chip style={styles.greyChip}>Inactive</Chip>}
          {profile.isSuperuser && <Chip>Superuser</Chip>}
          {profile.isVerified ? <Chip>Verified</Chip> : <Chip style={styles.greyChip}>Unverified</Chip>}
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

        <Dialog visible={logoutDialogVisible} onDismiss={() => setLogoutDialogVisible(false)}>
          <Dialog.Title>Logout</Dialog.Title>
          <Dialog.Content>
            <Text>Are you sure you want to log out?</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setLogoutDialogVisible(false)}>Cancel</Button>
            <Button onPress={confirmLogout} textColor="#d32f2f">
              Logout
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={deleteDialogVisible} onDismiss={() => setDeleteDialogVisible(false)}>
          <Dialog.Title>Delete Account</Dialog.Title>
          <Dialog.Content>
            <Text>To delete your account and all associated data, please send an email request to:</Text>
            <Link href="mailto:relab@cml.leidenuniv.nl">
              <Text style={{ marginTop: 10, fontWeight: 'bold' }}>relab@cml.leidenuniv.nl</Text>
            </Link>
            <Text style={{ marginTop: 10 }}>We&apos;ll process your request and confirm the deletion via email.</Text>
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
    <Pressable style={styles.action} onPress={onPress}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.actionTitle, titleStyle]}>{title}</Text>
        {subtitle && <Text style={styles.actionSubtitle}>{subtitle}</Text>}
      </View>
      {!hideChevron && <IconButton icon="chevron-right" size={26} onPress={onPress} />}
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
  idText: {
    fontSize: 12,
    opacity: 0.35,
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
  danger: {
    color: '#d32f2f',
  },
});

import { Chip, Text } from '@/components/base';
import { Link, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, TextStyle, View } from 'react-native';
import { Button, Dialog, Divider, IconButton, Portal, TextInput } from 'react-native-paper';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

import { getUser, getToken, logout, verify, unlinkOAuth, updateUser } from '@/services/api/authentication';
import { User } from '@/types/User';

export default function ProfileTab() {
  // Hooks
  const router = useRouter();

  // States
  const [profile, setProfile] = useState<User | undefined>(undefined);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [logoutDialogVisible, setLogoutDialogVisible] = useState(false);
  const [editUsernameVisible, setEditUsernameVisible] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [unlinkDialogVisible, setUnlinkDialogVisible] = useState(false);
  const [providerToUnlink, setProviderToUnlink] = useState('');

  // Effects
  useEffect(() => {
    getUser(true).then(setProfile);
  }, []);

  // callbacks
  const onLogout = () => {
    setLogoutDialogVisible(true);
  };

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
      .then(() => {
        alert('Verification email sent. Please check your inbox.');
      })
      .catch(() => {
        alert('Failed to send verification email. Please try again later.');
      });
  };

  const onDeleteAccount = () => {
    setDeleteDialogVisible(true);
  };

  const confirmDeleteAccount = () => {
    setDeleteDialogVisible(false);
  };

  const handleUpdateUsername = async () => {
    try {
      if (newUsername.length < 2) {
        alert("Username must be at least 2 characters.");
        return;
      }
      const updatedUser = await updateUser({ username: newUsername });
      if (updatedUser) {
        setProfile(updatedUser);
      }
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
      
      // Request needs the current user's token or session to link properly
      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(associateUrl, {
        headers,
        ...(Platform.OS === 'web' ? { credentials: 'include' } : {})
      });

      if (!response.ok) {
        throw new Error('Failed to reach association endpoint.');
      }
      const data = await response.json();

      const result = await WebBrowser.openAuthSessionAsync(data.authorization_url, redirectUri);
      
      if (result.type === 'success') {
        // Refresh user profile bypassing cache
        getUser(true).then(setProfile);
      }
    } catch (err: any) {
      alert(`Failed to start link flow: ${err.message || ''}`);
    }
  };

  // Sub Render >> No profile (not logged in)
  if (!profile) {
    return null;
  }

  // Render
  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text
        style={{
          marginTop: 80,
          fontSize: 40,
        }}
      >
        {'Hi'}
      </Text>
      <Pressable onPress={() => { setNewUsername(profile.username); setEditUsernameVisible(true); }}>
        <Text
          style={{
            fontSize: Platform.OS === 'web' ? 40 : 80,
            fontWeight: 'bold',
          }}
          numberOfLines={Platform.OS === 'web' ? undefined : 1}
          adjustsFontSizeToFit={true}
        >
          {profile.username + '.'}
        </Text>
      </Pressable>

      {/* User Info */}
      <View
        style={{ marginTop: 25, marginBottom: 15, gap: 8 }}
        //TODO: Allow change of email. Requires backend support to change and re-verify email address
      >
        <Text style={{ fontSize: 16, opacity: 0.6 }}>{profile.email}</Text>
        <Text style={{ fontSize: 12, opacity: 0.4 }}>ID: {profile.id}</Text>
      </View>

      <View
        style={{ marginTop: 12, marginBottom: 15, gap: 10, flexDirection: 'row', flexWrap: 'wrap' }}
        //TODO: Add public user profile page with stats and optional contact info
      >
        {profile.isActive ? <Chip>Active</Chip> : <Chip style={{ backgroundColor: 'lightgrey' }}>Inactive</Chip>}
        {profile.isSuperuser && <Chip>Superuser</Chip>}
        {profile.isVerified ? <Chip>Verified</Chip> : <Chip style={{ backgroundColor: 'lightgrey' }}>Unverified</Chip>}
      </View>

      <Divider style={{ marginBottom: 20 }} />

      {/* Actions */}
      <ProfileAction 
        title={'Logout'} 
        subtitle={'Change to another account'} 
        onPress={onLogout} 
        titleStyle={{ color: '#d32f2f' }} 
      />
      {profile.isVerified || (
        <ProfileAction
          title={'Verify your email address'}
          subtitle={'Resend the verification email'}
          onPress={onVerifyAccount}
        />
      )}

      <Divider style={{ marginVertical: 20 }} />
      <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 10 }}>Linked Accounts</Text>
      
      {profile.oauth_accounts?.some(acc => acc.oauth_name === 'google') ? (
        <ProfileAction
            title={'Unlink Google Account'}
            subtitle={'Connected as ' + profile.oauth_accounts.find(a => a.oauth_name === 'google')?.account_email!}
            onPress={() => { setProviderToUnlink('google'); setUnlinkDialogVisible(true); }}
            titleStyle={{ color: '#d32f2f' }}
        />
      ) : (
        <ProfileAction
            title={'Link Google Account'}
            subtitle={'Continue with Google'}
            onPress={() => handleLinkOAuth('google')}
        />
      )}

      {profile.oauth_accounts?.some(acc => acc.oauth_name === 'github') ? (
        <ProfileAction
            title={'Unlink GitHub Account'}
            subtitle={'Connected as ' + profile.oauth_accounts.find(a => a.oauth_name === 'github')?.account_email!}
            onPress={() => { setProviderToUnlink('github'); setUnlinkDialogVisible(true); }}
            titleStyle={{ color: '#d32f2f' }}
        />
      ) : (
        <ProfileAction
            title={'Link GitHub Account'}
            subtitle={'Continue with GitHub'}
            onPress={() => handleLinkOAuth('github')}
        />
      )}

      {
        /* Delete Account */
        // TODO: Implement in-app account deletion. For now, just provide instructions to email support
      }
      <View style={{ marginTop: 20 }}>
        <ProfileAction
          title={'Delete Account?'}
          onPress={onDeleteAccount}
          titleStyle={{ fontSize: 15, fontWeight: 'bold', color: '#d32f2f', opacity: 0.8 }}
          hideChevron={true}
        />
      </View>

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
            <Text>Are you sure you want to disconnect this {providerToUnlink} account from your profile?</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setUnlinkDialogVisible(false)}>Cancel</Button>
            <Button onPress={handleUnlinkOAuthConfirm} textColor="#d32f2f">Unlink</Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={logoutDialogVisible} onDismiss={() => setLogoutDialogVisible(false)}>
          <Dialog.Title>Logout</Dialog.Title>
          <Dialog.Content>
            <Text>Are you sure you want to log out of your account?</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setLogoutDialogVisible(false)}>Cancel</Button>
            <Button onPress={confirmLogout} textColor="#d32f2f">Logout</Button>
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
    </View>
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
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginVertical: 5,
      }}
      onPress={onPress}
    >
      <View style={{ flexDirection: 'column' }}>
        <Text
          style={{
            flex: 1,
            marginRight: 10,
            fontSize: 18,
            fontWeight: 'bold',
            ...titleStyle,
          }}
        >
          {title}
        </Text>
        {subtitle && (
          <Text
            style={{
              flex: 1,
              marginRight: 10,
              fontSize: 15,
              opacity: 0.7,
            }}
          >
            {subtitle}
          </Text>
        )}
      </View>
      {!hideChevron && <IconButton icon="chevron-right" size={30} onPress={onPress} />}
    </Pressable>
  );
}

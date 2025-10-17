import { Link, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, TextStyle, View } from 'react-native';
import { Button, Dialog, Divider, IconButton, Portal } from 'react-native-paper';
import { Chip, Text } from '@/components/base';

import { getUser, logout, verify } from '@/services/api/authentication';
import { User } from '@/types/User';

export default function ProfileTab() {
  // Hooks
  const router = useRouter();

  // States
  const [profile, setProfile] = useState<User | undefined>(undefined);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);

  // Effects
  useEffect(() => {
    getUser().then(setProfile);
  }, []);

  // callbacks
  const onLogout = () => {
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
      <ProfileAction title={'Logout'} subtitle={'Change to another account'} onPress={onLogout} />
      {profile.isVerified || (
        <ProfileAction
          title={'Verify your email address'}
          subtitle={'Resend the verification email'}
          onPress={onVerifyAccount}
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

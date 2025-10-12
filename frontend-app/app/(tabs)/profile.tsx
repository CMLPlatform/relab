import { useEffect, useState } from 'react';
import { Card, Text, Chip, Button } from 'react-native-paper';

import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { User } from '@/types/User';
import { getUser, logout } from '@/services/api/authentication';

export default function ProfileTab() {
  // Hooks
  const router = useRouter();

  // States
  const [profile, setProfile] = useState<User | undefined>(undefined);

  // Effects
  useEffect(() => {
    getUser().then(setProfile);
  }, []);

  // callbacks
  const logoutCallback = () => {
    logout().then(() => {
      setProfile(undefined);
      router.replace('/login');
    });
  };

  // Sub Render >> No profile (not logged in)
  if (!profile) {
    return null;
  }

  // Render
  return (
    <View style={{ padding: 10, gap: 10 }}>
      <Card style={{ padding: 10 }}>
        <Card.Title title={profile.username} subtitle={profile.email} />
        <Card.Content>
          <View style={{ marginVertical: 12, gap: 10, flexDirection: 'row', flexWrap: 'wrap' }}>
            {profile.isActive && <Chip>Active</Chip>}
            {profile.isSuperuser && <Chip>Superuser</Chip>}
          </View>
          <Text variant={'labelSmall'} style={{ textAlign: 'right' }}>
            {profile.id}
          </Text>
        </Card.Content>
      </Card>
      <Button mode="contained" onPress={logoutCallback}>
        Logout
      </Button>
    </View>
  );
}

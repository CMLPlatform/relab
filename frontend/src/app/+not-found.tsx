import { Link, Stack } from 'expo-router';
import { Button, Text } from 'react-native-paper';
import { Screen } from '@/lib/ui/components/Screen';

export default function NotFoundScreen() {
  return (
    <Screen>
      <Stack.Screen name="not-found" options={{ title: 'Page Not Found' }} />

      <Text variant="headlineMedium" style={{ marginBottom: 16, textAlign: 'center' }}>
        This page doesn&apos;t exist.
      </Text>

      <Link href="/" asChild>
        <Button mode="contained" icon="home">
          Go to home screen!
        </Button>
      </Link>
    </Screen>
  );
}

import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Card, Text } from 'react-native-paper';
import { useVerifyEmail } from '@/features/auth/useVerifyEmail';
import { useAppTheme } from '@/theme';

export default function VerifyEmailScreen() {
  const theme = useAppTheme();
  const { isLoading, error, success, goHome } = useVerifyEmail();

  return (
    <View style={styles.screen}>
      <Card>
        <Card.Content style={styles.cardContent}>
          <Text variant="headlineMedium">Verify Email</Text>

          {isLoading && (
            <View style={styles.centeredState}>
              <ActivityIndicator size="large" />
              <Text variant="bodyLarge">Verifying your email...</Text>
            </View>
          )}

          {error && !isLoading && (
            <View style={styles.centeredState}>
              <Text variant="bodyLarge" style={{ color: theme.colors.error, textAlign: 'center' }}>
                {error}
              </Text>
              <Button mode="contained" onPress={goHome}>
                Back to Home
              </Button>
            </View>
          )}

          {success && !isLoading && (
            <View style={styles.centeredState}>
              <Text
                variant="bodyLarge"
                style={{ color: theme.colors.primary, textAlign: 'center' }}
              >
                Email verified successfully! You can now login.
              </Text>
              <Text variant="bodyMedium">Redirecting to home...</Text>
            </View>
          )}
        </Card.Content>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  cardContent: {
    gap: 16,
    alignItems: 'center',
    paddingVertical: 32,
  },
  centeredState: {
    gap: 12,
    alignItems: 'center',
  },
});

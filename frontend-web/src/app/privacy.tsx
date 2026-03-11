import { InlineLink } from '@/lib/ui/components/InlineLink';
import { Screen } from '@/lib/ui/components/Screen';
import { Stack } from 'expo-router';
import { Card, Divider, Text } from 'react-native-paper';

export default function PrivacyScreen() {
  return (
    <Screen>
      <Stack.Screen name="privacy" options={{ title: 'Privacy Policy' }} />
      <Text variant="bodyMedium">
        This Privacy Policy explains what we collect, how we use it, and your choices.
      </Text>

      <Card>
        <Card.Content style={{ gap: 12 }}>
          <Text variant="titleMedium">User Information</Text>

          <Text variant="bodyMedium">
            When you register we collect a username and email for your account, and a password used for authentication.
            Passwords are stored only in hashed form. We use your email for authentication and important service
            notifications (no marketing unless you opt in).
          </Text>
        </Card.Content>
      </Card>

      <Card>
        <Card.Content style={{ gap: 12 }}>
          <Text variant="titleMedium">Uploads & Media</Text>

          <Text variant="bodyMedium">
            Files and images you upload are stored on our servers and included in regular backups. We use uploads to
            display your contributions in the app and for research purposes when you choose to contribute. Retention is
            managed for service operation and backups. You can delete your products and uploaded images yourself in the
            app; if you need assistance we will remove uploads and any linked metadata on request.
          </Text>

          <Text variant="bodyMedium" style={{ marginTop: 8 }}>
            If research contributors' data is published it will be de-identified unless you explicitly agree otherwise.
          </Text>
        </Card.Content>
      </Card>

      <Card>
        <Card.Content style={{ gap: 12 }}>
          <Text variant="titleMedium">AI & Research Use</Text>

          <Text variant="bodyMedium">
            We may use de-identified research contributions for research purposes only. We do not use personal
            account information (email, username, password) to train models. Contact us for details or to request
            restrictions on your contributed data.
          </Text>
        </Card.Content>
      </Card>

      <Card>
        <Card.Content style={{ gap: 12 }}>
          <Text variant="titleMedium">Your Rights</Text>

          <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>
            Newsletter
          </Text>
          <Text variant="bodyMedium">
            You can <InlineLink href="/newsletter/unsubscribe-form">unsubscribe</InlineLink> at any time; your email will
            be removed when you do.
          </Text>

          <Text variant="bodyMedium" style={{ fontWeight: 'bold', marginTop: 8 }}>
            Account holders
          </Text>
          <Text variant="bodyMedium">
            You may access and update your account details, and request deletion of your account and associated data.
          </Text>

          <Divider style={{ marginVertical: 8 }} />

          <Text variant="bodyMedium">
            Contact us at <InlineLink href="mailto:relab@cml.leidenuniv.nl">relab@cml.leidenuniv.nl</InlineLink> for
            questions or data requests.
          </Text>
        </Card.Content>
      </Card>

      <Text variant="bodySmall" style={{ fontStyle: 'italic', opacity: 0.7 }}>
        Last updated: March 11, 2026
      </Text>
    </Screen>
  );
}

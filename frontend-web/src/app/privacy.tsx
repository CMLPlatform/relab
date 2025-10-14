import { Stack } from 'expo-router';
import { Card, Divider, Text } from 'react-native-paper';
import { InlineLink } from '@/lib/ui/components/InlineLink';
import { Screen } from '@/lib/ui/components/Screen';

export default function PrivacyScreen() {
  return (
    <Screen>
      <Stack.Screen name="privacy" options={{ title: 'Privacy Policy' }} />

      <Text variant="bodyMedium">
        This Privacy Policy describes how Reverse Engineering Lab collects, uses, and protects your personal information
        when you use our platform.
      </Text>

      <Card>
        <Card.Content style={{ gap: 12 }}>
          <Text variant="titleMedium">What Information We Collect</Text>

          <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>
            Newsletter Subscribers
          </Text>
          <Text variant="bodyMedium">
            When you subscribe to our newsletter, we collect your email address. We use it solely to send you updates
            about the Reverse Engineering Lab platform.
          </Text>

          <Text variant="bodyMedium" style={{ fontWeight: 'bold', marginTop: 8 }}>
            App Users
          </Text>
          <Text variant="bodyMedium">When you create an account on our application, we collect:</Text>
          <Text variant="bodyMedium">
            • Email address: Used for account authentication and communication{'\n'}• Username: Your chosen display name
            for the platform{'\n'}• Password: Stored in hashed form for secure authentication (we never store passwords
            in plain text)
          </Text>
        </Card.Content>
      </Card>

      <Card>
        <Card.Content style={{ gap: 12 }}>
          <Text variant="titleMedium">Your Rights</Text>

          <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>
            Newsletter Subscribers
          </Text>
          <Text variant="bodyMedium">
            • <InlineLink href="/newsletter/unsubscribe-form">Unsubscribe</InlineLink> at any time; we automatically
            delete your email when you unsubscribe
          </Text>

          <Text variant="bodyMedium" style={{ fontWeight: 'bold', marginTop: 8 }}>
            App Users
          </Text>
          <Text variant="bodyMedium">
            • Access and update your account information{'\n'}• Request deletion of your account and associated data
          </Text>

          <Divider style={{ marginVertical: 8 }} />

          <Text variant="bodyMedium">
            Contact us at <InlineLink href="mailto:info@cml-relab.org">info@cml-relab.org</InlineLink> with questions or
            data requests.
          </Text>
        </Card.Content>
      </Card>

      <Card>
        <Card.Content style={{ gap: 12 }}>
          <Text variant="titleMedium">Data Security & Sharing</Text>

          <Text variant="bodyMedium">
            • We implement industry-standard security measures to protect your information{'\n'}• All passwords are
            stored using secure hashing algorithms{'\n'}• We <Text style={{ fontWeight: 'bold' }}>never</Text> share
            your personal information with third parties
          </Text>

          <Text variant="bodyMedium" style={{ marginTop: 8 }}>
            This platform supports open source research in industrial ecology. Any research data you contribute may be
            made publicly available, but your personal information (email, username, password) is always kept separate
            and private.
          </Text>
        </Card.Content>
      </Card>

      <Text variant="bodySmall" style={{ fontStyle: 'italic', opacity: 0.7 }}>
        Last updated: October 15, 2025
      </Text>
    </Screen>
  );
}

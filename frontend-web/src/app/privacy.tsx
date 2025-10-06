import { Stack } from 'expo-router';
import React from 'react';
import { Card, Text } from 'react-native-paper';
import { Screen } from '@/lib/ui/components/Screen';
import { InlineLink } from '@/lib/ui/components/InlineLink';

export default function PrivacyScreen() {
  return (
    <Screen>
      <Stack.Screen name="privacy" options={{ title: 'Privacy Policy' }} />

      <Text variant="bodyMedium">
        We only collect your email address when you subscribe to our newsletter. We use it solely to send updates about
        the Reverse Engineering Lab platform.
      </Text>

      <Card>
        <Card.Content style={{ gap: 12 }}>
          <Text variant="titleMedium">Your Rights</Text>

          <Text variant="bodyMedium">
            • <InlineLink href="/newsletter/unsubscribe-form">Unsubscribe</InlineLink> at any time
          </Text>

          <Text variant="bodyMedium">
            • Contact us at <InlineLink href="mailto:info@cml-relab.org">info@cml-relab.org</InlineLink> for questions
          </Text>

          <Text variant="bodyMedium">
            We never share your email with third parties and delete it when you unsubscribe.
          </Text>
        </Card.Content>
      </Card>

      <Text variant="bodySmall" style={{ fontStyle: 'italic', opacity: 0.7 }}>
        Last updated: May 26, 2025
      </Text>
    </Screen>
  );
}

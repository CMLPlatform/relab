import { Stack } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { Button, Card, Divider, Snackbar, Text, TextInput, useTheme } from 'react-native-paper';
import { Screen } from '@/lib/ui/components/Screen';
import { InlineLink } from '@/lib/ui/components/InlineLink';
import { ExternalLinkButton } from '@/lib/ui/components/ExternalLinkButton';

export default function HomeScreen() {
  const theme = useTheme();
  const [email, setEmail] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [snackbarVisible, setSnackbarVisible] = React.useState(false);
  const [snackbarMessage, setSnackbarMessage] = React.useState('');
  const [isSuccess, setIsSuccess] = React.useState(false);

  const showMessage = (message: string, success: boolean) => {
    setSnackbarMessage(message);
    setIsSuccess(success);
    setSnackbarVisible(true);
  };

  const handleSubscribe = async () => {
    if (!email?.includes('@')) {
      showMessage('Please enter a valid email address', false);
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/newsletter/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(email),
      });

      setIsLoading(false);
      const result = await response.json();

      if (response.ok) {
        showMessage('Thanks for subscribing! Please check your email for confirmation.', true);
        setEmail('');
      } else {
        showMessage(result.detail || 'Subscription failed. Please try again.', false);
      }
    } catch (error) {
      console.error('Newsletter subscription failed:', error);
      setIsLoading(false);
      showMessage('An error occurred, please try again later.', false);
    }
  };

  return (
    <Screen>
      <Stack.Screen name="index" options={{ headerShown: false }} />

      {/* Header Card */}
      <Card>
        <Card.Content style={{ gap: 12 }}>
          <Text variant="headlineLarge">Reverse Engineering Lab</Text>
          <Text variant="bodyLarge">
            Welcome to the Reverse Engineering Lab app. This interface provides access to data collection tools and
            resources for reverse engineering research.
          </Text>
        </Card.Content>
      </Card>

      {/* Demo Card */}
      <Card>
        <Card.Content style={{ gap: 12 }}>
          <Text variant="headlineMedium">🔧 Product Library Demo</Text>
          <Text variant="bodyMedium">
            Browse our sample product library and explore the disassembly data collection tools with example data.
          </Text>
          <ExternalLinkButton href={process.env.EXPO_PUBLIC_APP_URL!} icon="play-circle" mode="outlined">
            Demo
          </ExternalLinkButton>
        </Card.Content>
      </Card>

      {/* Documentation Card */}
      <Card>
        <Card.Title title="📚 Documentation" titleVariant="headlineMedium" />
        <Card.Content style={{ gap: 8 }}>
          <ExternalLinkButton href={process.env.EXPO_PUBLIC_MKDOCS_URL!} icon="book-open" mode="outlined">
            Platform Docs
          </ExternalLinkButton>

          <ExternalLinkButton href={`${process.env.EXPO_PUBLIC_API_URL}/docs`} icon="code-json" mode="outlined">
            API Docs
          </ExternalLinkButton>

          <ExternalLinkButton href="https://github.com/CMLPlatform/relab" icon="github" mode="outlined">
            GitHub
          </ExternalLinkButton>
        </Card.Content>
      </Card>

      {/* Newsletter Card */}
      <Card>
        <Card.Content style={{ gap: 12, alignItems: 'center' }}>
          <Text variant="headlineMedium">📧 Stay Updated</Text>
          <Text variant="bodyMedium">Subscribe to receive updates when the full frontend application is launched.</Text>

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TextInput
              label="Email address"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              mode="outlined"
              disabled={isLoading}
            />

            <Button
              mode="contained"
              onPress={handleSubscribe}
              loading={isLoading}
              disabled={isLoading || !email}
              style={{ justifyContent: 'center' }}
            >
              Subscribe
            </Button>
          </View>

          <Divider style={{ marginVertical: 8, width: '100%' }} />
          <Text variant="bodySmall">
            By subscribing, you agree to our <InlineLink href="/privacy">Privacy Policy</InlineLink>. We only use your
            email to send you updates about our platform.
          </Text>
        </Card.Content>
      </Card>

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
        action={{
          label: 'OK',
          onPress: () => setSnackbarVisible(false),
        }}
        theme={{
          colors: {
            inverseSurface: isSuccess ? theme.colors.primary : theme.colors.error,
            inverseOnSurface: isSuccess ? theme.colors.onPrimary : theme.colors.onError,
          },
        }}
      >
        {snackbarMessage}
      </Snackbar>
    </Screen>
  );
}

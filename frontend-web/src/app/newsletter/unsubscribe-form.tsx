import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { Button, Card, Snackbar, Text, TextInput, useTheme } from 'react-native-paper';

const UnsubscribeFormScreen = () => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const theme = useTheme();

  const showMessage = (message: string, success: boolean) => {
    setSnackbarMessage(message);
    setIsSuccess(success);
    setSnackbarVisible(true);
  };

  const handleUnsubscribe = async () => {
    if (!email?.includes('@')) {
      showMessage('Please enter a valid email address', false);
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/newsletter/request-unsubscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(email),
      });

      setIsLoading(false);

      if (response.ok) {
        const data = await response.json();
        showMessage(data.message || 'Please check your email to confirm unsubscription.', true);
        setEmail('');
      } else {
        const result = await response.json();
        showMessage(result.detail || 'An error occurred. Please try again.', false);
      }
    } catch (error) {
      console.error('Newsletter subscription failed:', error);
      setIsLoading(false);
      showMessage('An error occurred. Please try again later.', false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20 }}>
      <Stack.Screen name="unsubscribe-form" options={{ title: 'Unsubscribe from Newsletter' }} />
      <View style={{ maxWidth: 600, alignSelf: 'center', width: '100%' }}>
        <Card>
          <Card.Content style={{ marginBottom: 20, gap: 16 }}>
            <Text variant="bodyMedium">Please enter your email address to unsubscribe from our newsletter.</Text>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TextInput
                label="Email address"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                mode="outlined"
                style={{ flex: 1 }}
                disabled={isLoading}
              />

              <Button
                mode="contained"
                onPress={handleUnsubscribe}
                loading={isLoading}
                disabled={isLoading || !email}
                style={{ justifyContent: 'center' }}
              >
                Unsubscribe
              </Button>
            </View>

            <Text variant="bodySmall" style={{ color: '#6B7280' }}>
              You will receive a confirmation email with a link to complete the unsubscription process. This step helps
              us ensure that only the actual email owner can unsubscribe.
            </Text>
          </Card.Content>
        </Card>

        <Snackbar
          visible={snackbarVisible}
          onDismiss={() => setSnackbarVisible(false)}
          duration={4000}
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
      </View>
    </ScrollView>
  );
};

export default UnsubscribeFormScreen;

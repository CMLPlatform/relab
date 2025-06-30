import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { ActivityIndicator, Card, Text } from 'react-native-paper';

const ConfirmSubscriptionScreen = () => {
  const [confirmationStatus, setConfirmationStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Confirming your newsletter subscription...');
  const { token } = useLocalSearchParams();
  const router = useRouter();

  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setConfirmationStatus('error');
        setMessage('No confirmation token provided. Please check your confirmation email.');
        return;
      }

      try {
        const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/newsletter/confirm`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(token),
        });

        if (response.ok) {
          setConfirmationStatus('success');
          setMessage('Newsletter subscription confirmed successfully! You will be redirected to the homepage shortly.');
          setTimeout(() => {
            router.push('/');
          }, 3000);
        } else {
          const data = await response.json();
          setConfirmationStatus('error');
          setMessage(data.detail || 'Confirmation failed. Please try registering again.');
        }
      } catch {
        setConfirmationStatus('error');
        setMessage('An error occurred during confirmation. Please try again later.');
      }
    };

    verifyToken();
  }, [token, router]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 16 }}>
      <Stack.Screen name="confirm" options={{ title: 'Confirm Newsletter Subscription' }} />

      <View style={{ maxWidth: 800, alignSelf: 'center', width: '100%' }}>
        <Card>
          <Card.Content style={{ gap: 16 }}>
            {confirmationStatus === 'loading' && (
              <View style={{ alignItems: 'center', gap: 16 }}>
                <ActivityIndicator size="large" />
                <Text variant="bodyMedium">{message}</Text>
              </View>
            )}

            {(confirmationStatus === 'success' || confirmationStatus === 'error') && (
              <Text variant="bodyMedium">{message}</Text>
            )}
          </Card.Content>
        </Card>
      </View>
    </View>
  );
};

export default ConfirmSubscriptionScreen;

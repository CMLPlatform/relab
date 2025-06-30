import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { ActivityIndicator, Card, Text } from 'react-native-paper';

const UnsubscribeScreen = () => {
  const [unsubscriptionStatus, setUnsubscriptionStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Unsubscribing from the newsletter...');
  const { token } = useLocalSearchParams();
  const router = useRouter();

  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setUnsubscriptionStatus('error');
        setMessage('No token provided. Please check your email.');
        return;
      }

      try {
        const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/newsletter/unsubscribe`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(token),
        });

        if (response.ok) {
          setUnsubscriptionStatus('success');
          setMessage('Successfully unsubscribed from the newsletter. You will be redirected to the homepage shortly.');
          setTimeout(() => {
            router.push('/');
          }, 3000);
        } else {
          const data = await response.json();
          setUnsubscriptionStatus('error');
          setMessage(data.detail || 'Newsletter unsubscription failed. Please try again.');
        }
      } catch {
        setUnsubscriptionStatus('error');
        setMessage('An error occurred during newsletter unsubscription. Please try again later.');
      }
    };

    verifyToken();
  }, [token, router]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 16 }}>
      <Stack.Screen name="unsubscribe" options={{ title: 'Unsubscribe from Newsletter' }} />

      <View style={{ maxWidth: 800, alignSelf: 'center', width: '100%' }}>
        <Card>
          <Card.Content style={{ gap: 16 }}>
            {unsubscriptionStatus === 'loading' && (
              <View style={{ alignItems: 'center', gap: 16 }}>
                <ActivityIndicator size="large" />
                <Text variant="bodyMedium">{message}</Text>
              </View>
            )}

            {(unsubscriptionStatus === 'success' || unsubscriptionStatus === 'error') && (
              <Text variant="bodyMedium">{message}</Text>
            )}
          </Card.Content>
        </Card>
      </View>
    </View>
  );
};

export default UnsubscribeScreen;

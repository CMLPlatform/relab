import { ImageBackground } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Keyboard, Platform, useColorScheme, View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import Animated, { SensorType, useAnimatedSensor, useAnimatedStyle, withSpring } from 'react-native-reanimated';

import { useDialog } from '@/components/common/DialogProvider';
import { updateUser } from '@/services/api/authentication';

export default function Onboarding() {
  const router = useRouter();
  const dialog = useDialog();
  const rotation = useAnimatedSensor(SensorType.ROTATION, { interval: 20 });
  const colorScheme = useColorScheme();

  const backgroundStyle = useAnimatedStyle(() => {
    const { pitch, roll } = rotation.sensor.value;
    return {
      transform: [
        { translateX: withSpring(-roll * 80, { damping: 200 }) },
        { translateY: withSpring(-pitch * 80, { damping: 200 }) },
        { scale: 1.3 },
      ],
    };
  });

  const image = colorScheme === 'light' ? require('@/assets/images/bg-1.jpg') : require('@/assets/images/bg-2.jpg');

  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);

  const submitUsername = async () => {
    if (username.length < 2) {
      dialog.alert({
        title: 'Invalid Username',
        message: 'Username must be at least 2 characters.',
      });
      return;
    }
    
    setLoading(true);
    try {
      await updateUser({ username });
      router.replace({ pathname: '/products', params: { authenticated: 'true' } });
    } catch (error: any) {
      dialog.alert({
        title: 'Error',
        message: error.message || 'Unable to save username. It might be taken.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      {Platform.OS !== 'web' && (
        <Animated.Image source={image} style={[{ flex: 1, width: '180%', overflow: 'hidden' }, backgroundStyle]} />
      )}
      {Platform.OS === 'web' && <ImageBackground source={image} style={{ flex: 1 }} />}

      <View
        style={{
          padding: 20,
          gap: 15,
          position: 'absolute',
          bottom: Platform.OS !== 'web' && Keyboard.metrics() ? Keyboard.metrics()?.height : 0,
          width: '100%',
        }}
      >
        <LinearGradient
          colors={['transparent', colorScheme === 'light' ? 'white' : 'black']}
          style={{
            position: 'absolute',
            top: -50,
            left: 0,
            right: 0,
            bottom: 0,
          }}
        />
        <Text
          style={{
            fontSize: 32,
            fontWeight: 'bold',
            textAlign: 'center',
            textShadowColor: colorScheme === 'light' ? 'white' : 'black',
            textShadowOffset: { width: 0, height: 0 },
            textShadowRadius: 10,
          }}
        >
          Welcome!
        </Text>
        <Text
          style={{
            fontSize: 16,
            textAlign: 'center',
            marginBottom: 10,
            textShadowColor: colorScheme === 'light' ? 'white' : 'black',
            textShadowOffset: { width: 0, height: 0 },
            textShadowRadius: 10,
          }}
        >
          Choose a username to continue.
        </Text>
        <TextInput
          mode={'outlined'}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="e.g. awesome_user"
          onSubmitEditing={submitUsername}
        />
        <Button mode="contained" loading={loading} disabled={loading} style={{ width: '100%', padding: 5 }} onPress={submitUsername}>
          Continue
        </Button>
      </View>
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          height: Platform.OS !== 'web' && Keyboard.metrics() ? Keyboard.metrics()?.height : 0,
          width: '100%',
          backgroundColor: colorScheme === 'light' ? 'white' : 'black',
        }}
      />
    </View>
  );
}

import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Keyboard, Platform, useColorScheme, View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import Animated, { SensorType, useAnimatedSensor, useAnimatedStyle, withSpring } from 'react-native-reanimated';

import { ImageBackground } from 'expo-image';
import { useDialog } from '@/components/common/DialogProvider';
import { getToken, login } from '@/services/api/authentication';

export default function Login() {
  // Hooks
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

  // Variables
  const image = colorScheme === 'light' ? require('@/assets/images/bg-1.jpg') : require('@/assets/images/bg-2.jpg');

  // States
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [keyboardShown, setKeyBoardShown] = useState(false);

  // Effects
  useEffect(() => {
    const checkToken = async () => {
      try {
        const token = await getToken();
        if (!token) {
          return;
        }

        const params = { authenticated: 'true' };
        router.replace({ pathname: '/products', params: params });
      } catch (err) {
        console.error('[Login useEffect] Failed to get token:', err);
      }
    };

    checkToken();
  }, [router]);

  useEffect(() => {
    Keyboard.addListener('keyboardDidShow', () => {
      setKeyBoardShown(true);
    });
    Keyboard.addListener('keyboardDidHide', () => {
      setKeyBoardShown(false);
    });
  }, []);

  // Callbacks
  const attemptLogin = async () => {
    try {
      const token = await login(email, password);
      if (!token) {
        dialog.alert({
          title: 'Login Failed',
          message: 'Invalid email or password.',
        });
        return;
      }
      const params = { authenticated: 'true' };
      router.replace({ pathname: '/products', params: params });
    } catch (error: any) {
      dialog.alert({
        title: 'Login Failed',
        message: error.message || 'Unable to reach server. Please try again later.',
      });
    }
  };

  // Render
  return (
    <View style={{ flex: 1 }}>
      {Platform.OS !== 'web' && (
        <Animated.Image source={image} style={[{ flex: 1, width: '180%', overflow: 'hidden' }, backgroundStyle]} />
      )}
      {Platform.OS === 'web' && <ImageBackground source={image} style={{ flex: 1 }} />}

      <View
        style={{
          padding: 20,
          gap: 10,
          position: 'absolute',
          bottom: keyboardShown && Keyboard.metrics() ? Keyboard.metrics()?.height : 0,
          width: '100%',
        }}
      >
        <LinearGradient
          colors={['transparent', colorScheme === 'light' ? 'white' : 'black']}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
        />
        <Text
          style={{
            fontSize: 40,
            fontWeight: 'bold',
            textAlign: 'right',
            textShadowColor: colorScheme === 'light' ? 'white' : 'black',
            textShadowOffset: { width: 0, height: 0 },
            textShadowRadius: 10,
          }}
        >
          {'ReLab.'}
        </Text>
        <TextInput
          mode={'outlined'}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Email address"
        />
        <TextInput
          mode={'outlined'}
          value={password}
          onChangeText={setPassword}
          autoCapitalize="none"
          secureTextEntry
          placeholder="Password"
        />
        <Button mode="contained" style={{ width: '100%', padding: 5 }} onPress={attemptLogin}>
          Login
        </Button>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <Button onPress={() => router.push('/forgot-password')}>Forgot Password?</Button>
          <Button onPress={() => router.push('/new-account')}>Create a new account</Button>
        </View>
      </View>
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          height: keyboardShown && Keyboard.metrics() ? Keyboard.metrics()?.height : 0,
          width: '100%',
          backgroundColor: colorScheme === 'light' ? 'white' : 'black',
        }}
      />
    </View>
  );
}

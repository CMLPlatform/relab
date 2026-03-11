import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Keyboard, Platform, useColorScheme, View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import Animated, { SensorType, useAnimatedSensor, useAnimatedStyle, withSpring } from 'react-native-reanimated';

import { useDialog } from '@/components/common/DialogProvider';
import { getToken, login, getUser } from '@/services/api/authentication';
import { ImageBackground } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';

WebBrowser.maybeCompleteAuthSession();

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
        const u = await getUser();
        if (!u) {
          return;
        }

        if (!u.username || u.username === 'Username not defined') {
          router.replace('/(auth)/onboarding');
        } else {
          router.replace({ pathname: '/products', params: { authenticated: 'true' } });
        }
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
      
      const u = await getUser(true);
      if (!u || !u.username || u.username === 'Username not defined') {
        router.replace('/(auth)/onboarding');
      } else {
        router.replace({ pathname: '/products', params: { authenticated: 'true' } });
      }
    } catch (error: any) {
      dialog.alert({
        title: 'Login Failed',
        message: error.message || 'Unable to reach server. Please try again later.',
      });
    }
  };

  const handleOAuthLogin = async (provider: 'google' | 'github') => {
    try {
      const transport = Platform.OS === 'web' ? 'session' : 'token';
      const redirectUri = Linking.createURL('/login');
      const authUrl = `${process.env.EXPO_PUBLIC_API_URL}/auth/oauth/${provider}/${transport}/authorize?redirect_uri=${encodeURIComponent(redirectUri)}`;

      // The backend returns a JSON payload containing the actual authorization URL
      const response = await fetch(authUrl, {
        ...(Platform.OS === 'web' ? { credentials: 'include' } : {})
      });
      if (!response.ok) {
        throw new Error('Failed to reach authorization endpoint.');
      }
      const data = await response.json();

      const result = await WebBrowser.openAuthSessionAsync(data.authorization_url, redirectUri);
      
      if (result.type === 'success' && result.url) {
        if (transport === 'token') {
          // Parse token from fragment or query params
          const urlObj = new URL(result.url.replace('#', '?'));
          const accessToken = urlObj.searchParams.get('access_token');
          if (accessToken) {
            await AsyncStorage.setItem('access_token', accessToken);
          }
        }
        
        const u = await getUser(true);
        if (!u || !u.username || u.username === 'Username not defined') {
          router.replace('/(auth)/onboarding');
        } else {
          router.replace({ pathname: '/products', params: { authenticated: 'true' } });
        }
      }
    } catch (err: any) {
      dialog.alert({
        title: 'Login Failed',
        message: err.message || 'OAuth login failed.',
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
          onSubmitEditing={attemptLogin}
        />
        <Button mode="contained" style={{ width: '100%', padding: 5 }} onPress={attemptLogin}>
          Login
        </Button>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 10 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: 'grey', opacity: 0.3 }} />
          <Text style={{ marginHorizontal: 10, opacity: 0.5 }}>or</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: 'grey', opacity: 0.3 }} />
        </View>

        <Button mode="outlined" icon="google" style={{ width: '100%' }} onPress={() => handleOAuthLogin('google')}>
          Continue with Google
        </Button>
        <Button mode="outlined" icon="github" style={{ width: '100%' }} onPress={() => handleOAuthLogin('github')}>
          Continue with GitHub
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

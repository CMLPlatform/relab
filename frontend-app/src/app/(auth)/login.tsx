import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, useColorScheme, View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import Animated, { SensorType, useAnimatedSensor, useAnimatedStyle, withSpring } from 'react-native-reanimated';

import { ImageBackground } from 'expo-image';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { getUser, login } from '@/services/api/authentication';
import { useDialog } from '@/components/common/DialogProvider';

WebBrowser.maybeCompleteAuthSession();

const OAUTH_ACCOUNT_NOT_LINKED_ERROR = 'OAUTH_USER_ALREADY_EXISTS';
const OAUTH_BROWSER_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function parseOAuthCallbackUrl(url: string): {
  success: boolean;
  error?: string;
  detail?: string;
} {
  const callbackUrl = new URL(url.replace('#', '?'));
  const success = callbackUrl.searchParams.get('success') === 'true';
  const error = callbackUrl.searchParams.get('error');
  const detail = callbackUrl.searchParams.get('detail');

  return { success, error, detail };
}

function getOAuthErrorMessage(error?: string, detail?: string, platform: 'ios' | 'android' | 'web' = 'web'): string {
  // OAuth provider errors (standard OAuth error codes)
  if (error === 'access_denied' || error === 'user_denied') {
    return 'You denied access. Please try again and grant permission.';
  }
  if (error === 'invalid_scope') {
    return 'Invalid scope requested. Please contact support.';
  }
  if (error === 'server_error' || error === 'temporarily_unavailable') {
    return `The ${detail || 'provider'} is temporarily unavailable. Please try again in a moment.`;
  }

  // Backend errors
  if (detail) {
    return detail;
  }

  // Platform-specific guidance
  if (platform !== 'web') {
    return "OAuth login failed. Please ensure your device has internet and try again. If the browser didn't open, check your internet connection.";
  }

  return 'OAuth login failed. Please try again.';
}

function extractErrorDetail(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  const candidate = (payload as { detail?: unknown }).detail;
  if (typeof candidate === 'string') {
    return candidate;
  }

  if (candidate && typeof candidate === 'object') {
    const nested = candidate as { reason?: unknown; message?: unknown };
    if (typeof nested.reason === 'string') {
      return nested.reason;
    }
    if (typeof nested.message === 'string') {
      return nested.message;
    }
  }

  return undefined;
}

function isAccountNotLinkedError(detail: string | undefined): boolean {
  return detail === OAUTH_ACCOUNT_NOT_LINKED_ERROR;
}

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

  // Refs
  const emailRef = useRef<any>(null);

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
      if (!u) {
        dialog.alert({
          title: 'Login Failed',
          message: 'Unable to retrieve user information. Please try again.',
        });
        return;
      }

      if (!u.isActive) {
        dialog.alert({
          title: 'Account Suspended',
          message: 'Your account has been suspended. Please contact support for assistance.',
        });
        return;
      }

      if (!u.username || u.username === 'Username not defined') {
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
      const transport = 'session';
      const redirectUri = Linking.createURL('/login');
      const authUrl = `${process.env.EXPO_PUBLIC_API_URL}/auth/oauth/${provider}/${transport}/authorize?redirect_uri=${encodeURIComponent(redirectUri)}`;

      // The backend returns a JSON payload containing the actual authorization URL
      const response = await fetch(authUrl, {
        ...(Platform.OS === 'web' ? { credentials: 'include' } : {}),
      });
      if (!response.ok) {
        let detail: string | undefined;
        try {
          detail = extractErrorDetail(await response.json());
        } catch {
          detail = undefined;
        }

        if (isAccountNotLinkedError(detail)) {
          dialog.alert({
            title: 'Email Already Registered',
            message:
              'An account with this email already exists. Sign in with your email and password below, then link your account from your profile settings.',
            buttons: [
              { text: 'Cancel' },
              { text: 'Sign in with password', onPress: () => emailRef.current?.focus() },
            ],
          });
          return;
        }

        throw new Error(detail || 'Failed to reach authorization endpoint.');
      }
      const data = await response.json();

      // Open browser with timeout
      let result: any;
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('OAuth browser session timed out. Please try again.')),
          OAUTH_BROWSER_TIMEOUT_MS,
        ),
      );

      const browserPromise = WebBrowser.openAuthSessionAsync(data.authorization_url, redirectUri);
      result = await Promise.race([browserPromise, timeoutPromise]);

      if (result.type !== 'success' || !result.url) {
        // User cancelled the browser session
        return;
      }

      const { success, error, detail } = parseOAuthCallbackUrl(result.url);

      if (isAccountNotLinkedError(detail)) {
        dialog.alert({
          title: 'Email Already Registered',
          message:
            'An account with this email already exists. Sign in with your email and password below, then link your account from your profile settings.',
          buttons: [
            { text: 'Cancel' },
            { text: 'Sign in with password', onPress: () => emailRef.current?.focus() },
          ],
        });
        return;
      }

      if (!success) {
        const errorMsg = getOAuthErrorMessage(error, detail, (Platform.OS as any) !== 'web' ? Platform.OS : 'web');
        throw new Error(errorMsg);
      }

      // Validate session with retry logic
      let u = null;
      let retryCount = 0;
      const maxRetries = 2;

      while (retryCount <= maxRetries && !u) {
        try {
          u = await getUser(true);
        } catch (retryError: any) {
          retryCount++;
          if (retryCount > maxRetries) {
            throw new Error(
              "OAuth succeeded but we couldn't establish your session. " +
                (Platform.OS !== 'web'
                  ? 'Please try logging in again, or check your internet connection.'
                  : 'Please try again.'),
            );
          }
          // Wait before retrying
          await new Promise((resolve) => setTimeout(resolve, 300 * retryCount));
        }
      }

      if (!u) {
        throw new Error('OAuth succeeded but session validation failed. Please try again.');
      }

      if (!u.isActive) {
        dialog.alert({
          title: 'Account Suspended',
          message: 'Your account has been suspended. Please contact support for assistance.',
        });
        return;
      }

      if (!u.username || u.username === 'Username not defined') {
        router.replace('/(auth)/onboarding');
      } else {
        router.replace({ pathname: '/products', params: { authenticated: 'true' } });
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
          ref={emailRef}
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

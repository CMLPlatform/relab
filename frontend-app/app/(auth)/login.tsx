import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Keyboard, Platform, View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import Animated, { SensorType, useAnimatedSensor, useAnimatedStyle, withSpring } from 'react-native-reanimated';

import { useDialog } from '@/components/common/DialogProvider';
import { getToken, login } from '@/services/api/authentication';
import { ImageBackground } from 'expo-image';

export default function Login() {
  // Hooks
  const router = useRouter();
  const dialog = useDialog();
  const rotation = useAnimatedSensor(SensorType.ROTATION, { interval: 20 });

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

  // States
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [keyboardShown, setKeyBoardShown] = useState(false);

  // Effects
  useEffect(() => {
    getToken().then((token) => {
      if (!token) {
        return;
      }

      const params = { authenticated: 'true' };
      router.replace({ pathname: '/database', params: params });
    });
  }, []);

  useEffect(() => {
    Keyboard.addListener('keyboardDidShow', () => {
      setKeyBoardShown(true);
    });
    Keyboard.addListener('keyboardDidHide', () => {
      setKeyBoardShown(false);
    });
  }, []);

  // Callbacks
  const attemptLogin = () => {
    login(username, password).then((success) => {
      if (success) {
        const params = { authenticated: 'true' };
        router.replace({ pathname: '/database', params: params });
      } else {
        dialog.alert({ title: 'Login Failed', message: 'Invalid username or password.' });
      }
    });
  };

  // Render
  return (
    <View style={{ flex: 1 }}>
      {Platform.OS !== 'web' && (
        <Animated.Image
          source={require('../../assets/images/bg-1.jpg')}
          style={[{ flex: 1, width: '180%', overflow: 'hidden' }, backgroundStyle]}
        />
      )}
      {Platform.OS === 'web' && (
        <ImageBackground source={require('../../assets/images/bg-1.jpg')} style={{ flex: 1 }} />
      )}

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
          colors={['transparent', 'white']}
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
          }}
        >
          {'ReLab.'}
        </Text>
        <TextInput
          mode={'outlined'}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Username"
        />
        <TextInput
          mode={'outlined'}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="Password"
        />
        <Button mode="contained" style={{ width: '100%', padding: 5 }} onPress={attemptLogin}>
          Login
        </Button>
        <Button
          style={{ width: '100%', padding: 5, alignItems: 'flex-end' }}
          onPress={() => {
            router.push('/register');
          }}
        >
          Create a new account
        </Button>
      </View>
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          height: keyboardShown && Keyboard.metrics() ? Keyboard.metrics()?.height : 0,
          width: '100%',
          backgroundColor: 'white',
        }}
      />
    </View>
  );
}

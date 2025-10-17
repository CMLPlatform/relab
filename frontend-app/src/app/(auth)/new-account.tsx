import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Button, HelperText, IconButton, Text, TextInput } from 'react-native-paper';
import validator from 'validator';

import { login, register } from '@/services/api/authentication';

export default function NewAccount() {
  // Hooks
  const router = useRouter();

  // States
  const [section, setSection] = useState<'username' | 'email' | 'password'>('username');

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');

  // Functions
  const validateEmail = async (emailInput: string) => {
    setEmail(emailInput);
    setEmailError('');

    if (!emailInput) {
      return;
    }

    // Check if email format is valid
    if (!validator.isEmail(emailInput)) {
      setEmailError('Please enter a valid email address');
      return;
    }

    // Check for disposable email via backend
    try {
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/auth/validate-email?email=${encodeURIComponent(emailInput)}`,
      );
      const data = await response.json();

      if (!data.isValid) {
        setEmailError(data.reason || 'Please use a permanent email address');
        return;
      }
    } catch (error) {
      console.error('Error validating email:', error);
      // Continue even if the check fails - don't block the user
    }
  };

  const createAccount = async () => {
    const success = await register(username, email, password);
    if (!success) {
      alert('Account creation failed. Please try again.');
      return;
    }
    const loginSuccess = await login(email, password);
    if (!loginSuccess) {
      alert('Login failed. Please try logging in manually.');
      router.replace('/login');
      return;
    }
    router.navigate('/products');
  };

  // Render
  if (section === 'username') {
    return (
      <View style={{ flex: 1, padding: 20 }}>
        <Text
          style={{
            marginTop: 80,
            fontSize: 40,
            marginLeft: 5,
          }}
        >
          {'Welcome to'}
        </Text>
        <Text
          style={{
            fontSize: 80,
            fontWeight: 'bold',
          }}
        >
          {'ReLab.'}
        </Text>
        <Text
          style={{
            fontSize: 31,
            marginTop: 80,
            marginLeft: 5,
            marginBottom: 40,
          }}
        >
          {'Who are you?'}
        </Text>

        <View style={{ flexDirection: 'row' }}>
          <TextInput
            style={{ flex: 1, marginRight: 10 }}
            mode={'outlined'}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Username"
          />
          <IconButton
            icon="chevron-right"
            size={30}
            disabled={username.length === 0}
            onPress={() => setSection('email')}
          />
        </View>
        <Button
          style={{ position: 'absolute', bottom: 20, right: 20 }}
          onPress={() => {
            router.dismissTo('/login');
          }}
        >
          I already have an account
        </Button>
      </View>
    );
  }
  if (section === 'email') {
    return (
      <View style={{ flex: 1, padding: 20 }}>
        <Text
          style={{
            marginTop: 80,
            fontSize: 40,
            marginLeft: 5,
          }}
        >
          {'Hi'}
        </Text>
        <Text
          style={{
            fontSize: 80,
            fontWeight: 'bold',
          }}
        >
          {username + '.'}
        </Text>
        <Text
          style={{
            fontSize: 31,
            marginTop: 80,
            marginLeft: 5,
            marginBottom: 40,
          }}
        >
          {'How do we reach you?'}
        </Text>

        <View style={{ flexDirection: 'column', marginBottom: 10 }}>
          <View style={{ flexDirection: 'row' }}>
            <TextInput
              style={{ flex: 1, marginRight: 10 }}
              mode={'outlined'}
              value={email}
              onChangeText={validateEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="Email address"
              error={!!emailError}
            />
            <IconButton
              icon="chevron-right"
              size={30}
              disabled={email.length === 0 || !!emailError}
              onPress={() => setSection('password')}
            />
          </View>
          {emailError ? (
            <HelperText type="error" visible={!!emailError} style={{ marginTop: -8 }}>
              {emailError}
            </HelperText>
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
          <IconButton
            icon="chevron-left"
            size={18}
            iconColor="#999"
            onPress={() => setSection('username')}
            style={{ margin: 0 }}
          />
          <Text onPress={() => setSection('username')} style={{ fontSize: 13, color: '#999', marginLeft: 4 }}>
            Edit username
          </Text>
        </View>

        <Button
          style={{ position: 'absolute', bottom: 20, right: 20 }}
          onPress={() => {
            router.dismissTo('/login');
          }}
        >
          I already have an account
        </Button>
      </View>
    );
  }

  if (section === 'password') {
    return (
      <View style={{ flex: 1, padding: 20 }}>
        <Text
          style={{
            marginTop: 80,
            fontSize: 40,
            marginLeft: 5,
          }}
        >
          {'Finally,'}
        </Text>
        <Text
          style={{
            fontSize: 80,
            fontWeight: 'bold',
          }}
        >
          {username + '.'}
        </Text>
        <Text
          style={{
            fontSize: 31,
            marginTop: 80,
            marginLeft: 5,
            marginBottom: 40,
          }}
        >
          {'How will you log in?'}
        </Text>

        <View style={{ flexDirection: 'row' }}>
          <TextInput
            style={{ flex: 1, marginRight: 10 }}
            mode={'outlined'}
            value={password}
            onChangeText={setPassword}
            autoCapitalize="none"
            secureTextEntry
            placeholder="Password"
          />
          <IconButton icon="chevron-right" size={30} disabled={password.length === 0} onPress={createAccount} />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
          <IconButton
            icon="chevron-left"
            size={18}
            iconColor="#999"
            onPress={() => setSection('email')}
            style={{ margin: 0 }}
          />
          <Text onPress={() => setSection('email')} style={{ fontSize: 13, color: '#999', marginLeft: 4 }}>
            Edit email address
          </Text>
        </View>

        <View style={{ position: 'absolute', bottom: 20, left: 20, right: 20, alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 12, opacity: 0.7, textAlign: 'center' }}>
            By creating an account, you agree to our{' '}
            <Link href="https://cml-relab.org/privacy">
              <Text style={{ fontSize: 12, textDecorationLine: 'underline' }}>Privacy Policy</Text>
            </Link>
          </Text>

          <Button
            onPress={() => {
              router.dismissTo('/login');
            }}
          >
            I already have an account
          </Button>
        </View>
      </View>
    );
  }
}

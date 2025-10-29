import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, HelperText, IconButton, Text, TextInput } from 'react-native-paper';

import { login, register } from '@/services/api/authentication';
import { validateEmail, validatePassword, validateUsername } from '@/services/api/validation/user';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  welcomeText: {
    marginTop: 80,
    fontSize: 40,
    marginLeft: 5,
  },
  brandText: {
    fontSize: 80,
    fontWeight: 'bold',
  },
  questionText: {
    fontSize: 31,
    marginTop: 80,
    marginLeft: 5,
    marginBottom: 40,
  },
  inputContainer: {
    flexDirection: 'column',
    marginBottom: 10,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  textInput: {
    flex: 1,
    marginRight: 10,
  },
  helperText: {
    marginTop: -8,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  backButtonIcon: {
    margin: 0,
  },
  backButtonText: {
    fontSize: 13,
    color: '#999',
    marginLeft: 4,
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    alignItems: 'center',
    gap: 8,
  },
  privacyText: {
    fontSize: 12,
    opacity: 0.7,
    textAlign: 'center',
  },
  privacyLink: {
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  registerButton: {
    minWidth: 140,
  },
});

const PrivacyPolicy = () => (
  <Text style={styles.privacyText}>
    By creating an account, you agree to our{' '}
    <Link href="https://cml-relab.org/privacy">
      <Text style={styles.privacyLink}>Privacy Policy</Text>
    </Link>
  </Text>
);

export default function NewAccount() {
  const router = useRouter();

  const [section, setSection] = useState<'username' | 'email' | 'password'>('username');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

  const handleUsernameChange = (input: string) => {
    const trimmed = input.trim();
    setUsername(trimmed);

    const result = validateUsername(trimmed);
    setUsernameError(result.error || '');
  };

  const handleEmailChange = (input: string) => {
    setEmail(input);

    const result = validateEmail(input);
    setEmailError(result.error || '');
  };

  const handlePasswordChange = (input: string) => {
    setPassword(input);

    const result = validatePassword(input, username, email);
    setPasswordError(result.error || '');
  };

  const createAccount = async () => {
    // Final validation
    const usernameResult = validateUsername(username);
    if (!usernameResult.isValid) {
      alert(usernameResult.error);
      return;
    }

    const emailResult = validateEmail(email);
    if (!emailResult.isValid) {
      alert(emailResult.error);
      return;
    }

    const passwordResult = validatePassword(password, username, email);
    if (!passwordResult.isValid) {
      alert(passwordResult.error);
      return;
    }

    setIsRegistering(true);

    const result = await register(username, email, password);

    if (!result.success) {
      setIsRegistering(false);
      alert(result.error || 'Account creation failed. Please try again.');
      return;
    }

    const loginSuccess = await login(email, password);
    setIsRegistering(false);

    if (!loginSuccess) {
      alert('Account created! Please log in manually.');
      router.replace('/login');
      return;
    }

    router.navigate('/products');
  };

  if (section === 'username') {
    return (
      <View style={styles.container}>
        <Text style={styles.welcomeText}>Welcome to</Text>
        <Text style={styles.brandText}>ReLab.</Text>
        <Text style={styles.questionText}>Who are you?</Text>

        <View style={styles.inputContainer}>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
              mode="outlined"
              value={username}
              onChangeText={handleUsernameChange}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Username"
              error={!!usernameError}
            />
            <IconButton
              icon="chevron-right"
              size={30}
              disabled={!validateUsername(username).isValid}
              onPress={() => setSection('email')}
            />
          </View>
          {usernameError && (
            <HelperText type="error" visible style={styles.helperText}>
              {usernameError}
            </HelperText>
          )}
        </View>

        <View style={styles.bottomContainer}>
          <PrivacyPolicy />
          <Button onPress={() => router.dismissTo('/login')}>I already have an account</Button>
        </View>
      </View>
    );
  }

  if (section === 'email') {
    return (
      <View style={styles.container}>
        <Text style={styles.welcomeText}>Hi</Text>
        <Text style={styles.brandText}>{username}.</Text>
        <Text style={styles.questionText}>How do we reach you?</Text>

        <View style={styles.inputContainer}>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
              mode="outlined"
              value={email}
              onChangeText={handleEmailChange}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="Email address"
              error={!!emailError}
            />
            <IconButton
              icon="chevron-right"
              size={30}
              disabled={!validateEmail(email).isValid}
              onPress={() => setSection('password')}
            />
          </View>
          {emailError && (
            <HelperText type="error" visible style={styles.helperText}>
              {emailError}
            </HelperText>
          )}
        </View>

        <View style={styles.backButton}>
          <IconButton
            icon="chevron-left"
            size={18}
            iconColor="#999"
            onPress={() => setSection('username')}
            style={styles.backButtonIcon}
          />
          <Text onPress={() => setSection('username')} style={styles.backButtonText}>
            Edit username
          </Text>
        </View>

        <View style={styles.bottomContainer}>
          <PrivacyPolicy />
          <Button onPress={() => router.dismissTo('/login')}>I already have an account</Button>
        </View>
      </View>
    );
  }

  if (section === 'password') {
    return (
      <View style={styles.container}>
        <Text style={styles.welcomeText}>Finally,</Text>
        <Text style={styles.brandText}>{username}.</Text>
        <Text style={styles.questionText}>How will you log in?</Text>

        <View style={styles.inputContainer}>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
              mode="outlined"
              value={password}
              onChangeText={handlePasswordChange}
              autoCapitalize="none"
              secureTextEntry
              placeholder="Password"
              error={!!passwordError}
            />
            <Button
              mode="contained"
              onPress={createAccount}
              disabled={!validatePassword(password, username, email).isValid || isRegistering}
              loading={isRegistering}
              style={styles.registerButton}
            >
              Create Account
            </Button>
          </View>
          {passwordError && (
            <HelperText type="error" visible style={styles.helperText}>
              {passwordError}
            </HelperText>
          )}
        </View>

        <View style={styles.backButton}>
          <IconButton
            icon="chevron-left"
            size={18}
            iconColor="#999"
            onPress={() => setSection('email')}
            style={styles.backButtonIcon}
          />
          <Text onPress={() => setSection('email')} style={styles.backButtonText}>
            Edit email address
          </Text>
        </View>

        <View style={styles.bottomContainer}>
          <PrivacyPolicy />
          <Button onPress={() => router.dismissTo('/login')}>I already have an account</Button>
        </View>
      </View>
    );
  }
}

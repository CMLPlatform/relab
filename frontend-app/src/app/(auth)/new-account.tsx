import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { Button, HelperText, TextInput } from 'react-native-paper';

import { useDialog } from '@/components/common/DialogProvider';
import { useAuth } from '@/context/AuthProvider';
import { login, register } from '@/services/api/authentication';
import { validateEmail, validatePassword, validateUsername } from '@/services/api/validation/user';

const styles = StyleSheet.create({
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
  arrowButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowButtonDisabled: {
    opacity: 0.35,
  },
  arrowButtonText: {
    fontSize: 28,
    color: '#222',
    lineHeight: 28,
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
  backButtonArrow: {
    fontSize: 18,
    color: '#999',
    marginRight: 4,
    lineHeight: 18,
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
  privacyLinkDark: {
    color: '#F5F5F5',
  },
  registerButton: {
    minWidth: 140,
  },
});

const PrivacyPolicy = () => {
  const colorScheme = useColorScheme();
  const url = (
    process.env.EXPO_PUBLIC_WEBSITE_URL ? `${process.env.EXPO_PUBLIC_WEBSITE_URL}/privacy` : '/privacy'
  ) as any;
  const textColor = colorScheme === 'dark' ? '#F5F5F5' : '#111111';

  return (
    <Text style={[styles.privacyText, { color: textColor }]}>
      By creating an account, you agree to our{' '}
      <Text
        style={[styles.privacyLink, colorScheme === 'dark' ? styles.privacyLinkDark : { color: textColor }]}
        onPress={() => Linking.openURL(url)}
        accessibilityRole="link"
      >
        Privacy Policy
      </Text>
    </Text>
  );
};

export default function NewAccount() {
  const router = useRouter();
  const { refetch, user, isLoading: authLoading } = useAuth();
  const dialog = useDialog();
  const colorScheme = useColorScheme();

  const overlayColor = colorScheme === 'light' ? 'rgba(255,255,255,0.78)' : 'rgba(0,0,0,0.78)';
  const headlineColor = colorScheme === 'light' ? '#111111' : '#F5F5F5';
  const mutedColor = colorScheme === 'light' ? '#999999' : '#B7B7B7';

  useEffect(() => {
    if (authLoading || !user) return;
    router.replace('/products');
  }, [user, authLoading, router]);

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
    setUsernameError(validateUsername(trimmed).error || '');
  };

  const handleEmailChange = (input: string) => {
    setEmail(input);
    setEmailError(validateEmail(input).error || '');
  };

  const handlePasswordChange = (input: string) => {
    setPassword(input);
    setPasswordError(validatePassword(input, username, email).error || '');
  };

  const advanceFromUsername = () => {
    if (validateUsername(username).isValid) {
      setSection('email');
    }
  };

  const advanceFromEmail = () => {
    if (validateEmail(email).isValid) {
      setSection('password');
    }
  };

  const createAccount = async () => {
    const usernameResult = validateUsername(username);
    if (!usernameResult.isValid) {
      dialog.alert({ title: 'Invalid Username', message: usernameResult.error || '' });
      return;
    }

    const emailResult = validateEmail(email);
    if (!emailResult.isValid) {
      dialog.alert({ title: 'Invalid Email', message: emailResult.error || '' });
      return;
    }

    const passwordResult = validatePassword(password, username, email);
    if (!passwordResult.isValid) {
      dialog.alert({ title: 'Invalid Password', message: passwordResult.error || '' });
      return;
    }

    setIsRegistering(true);

    const result = await register(username, email, password);

    if (!result.success) {
      setIsRegistering(false);
      dialog.alert({
        title: 'Registration Failed',
        message: result.error || 'Account creation failed. Please try again.',
      });
      return;
    }

    const loginSuccess = await login(email, password);
    setIsRegistering(false);

    if (!loginSuccess) {
      dialog.alert({ title: 'Account Created', message: 'Your account was created! Please log in.' });
      router.replace('/login');
      return;
    }

    try {
      await refetch(true);
    } catch (err) {
      console.error('[NewAccount] Failed to refetch user after signup:', err);
    }

    router.replace('/products');
  };

  const isUsernameValid = validateUsername(username).isValid;
  const isEmailValid = validateEmail(email).isValid;
  const isPasswordValid = validatePassword(password, username, email).isValid;

  const usernameSection = [
    <Text key="welcome" style={[styles.welcomeText, { color: headlineColor }]}>
      Welcome to
    </Text>,
    <Text key="brand" style={[styles.brandText, { color: headlineColor }]}>
      RELab
    </Text>,
    <Text key="question" style={[styles.questionText, { color: headlineColor }]}>
      Who are you?
    </Text>,
    <View key="input" style={styles.inputContainer}>
      <View key="row" style={styles.inputRow}>
        <TextInput
          key="input"
          style={styles.textInput}
          mode="outlined"
          value={username}
          onChangeText={handleUsernameChange}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Username"
          returnKeyType="next"
          onSubmitEditing={advanceFromUsername}
          error={!!usernameError}
        />
        <Pressable
          key="next"
          testID="username-next"
          accessibilityRole="button"
          disabled={!isUsernameValid}
          onPress={() => setSection('email')}
          style={({ pressed }) => [
            styles.arrowButton,
            !isUsernameValid && styles.arrowButtonDisabled,
            pressed && isUsernameValid ? { opacity: 0.7 } : null,
          ]}
        >
          <Text style={[styles.arrowButtonText, { color: headlineColor }]}>›</Text>
        </Pressable>
      </View>
      {usernameError ? (
        <HelperText key="error" type="error" visible style={styles.helperText}>
          {usernameError}
        </HelperText>
      ) : null}
    </View>,
  ];

  const emailSection = [
    <Text key="welcome" style={[styles.welcomeText, { color: headlineColor }]}>
      Hi
    </Text>,
    <Text key="brand" style={[styles.brandText, { color: headlineColor }]}>
      {username}
    </Text>,
    <Text key="question" style={[styles.questionText, { color: headlineColor }]}>
      How do we reach you?
    </Text>,
    <View key="input" style={styles.inputContainer}>
      <View key="row" style={styles.inputRow}>
        <TextInput
          key="input"
          style={styles.textInput}
          mode="outlined"
          value={email}
          onChangeText={handleEmailChange}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          placeholder="Email address"
          returnKeyType="next"
          onSubmitEditing={advanceFromEmail}
          error={!!emailError}
        />
        <Pressable
          key="next"
          testID="email-next"
          accessibilityRole="button"
          disabled={!isEmailValid}
          onPress={() => setSection('password')}
          style={({ pressed }) => [
            styles.arrowButton,
            !isEmailValid && styles.arrowButtonDisabled,
            pressed && isEmailValid ? { opacity: 0.7 } : null,
          ]}
        >
          <Text style={[styles.arrowButtonText, { color: headlineColor }]}>›</Text>
        </Pressable>
      </View>
      {emailError ? (
        <HelperText key="error" type="error" visible style={styles.helperText}>
          {emailError}
        </HelperText>
      ) : null}
    </View>,
    <Pressable key="back" style={styles.backButton} onPress={() => setSection('username')}>
      <Text style={[styles.backButtonArrow, { color: mutedColor }]}>‹</Text>
      <Text style={[styles.backButtonText, { color: mutedColor }]}>Edit username</Text>
    </Pressable>,
  ];

  const passwordSection = [
    <Text key="welcome" style={[styles.welcomeText, { color: headlineColor }]}>
      Finally,
    </Text>,
    <Text key="brand" style={[styles.brandText, { color: headlineColor }]}>
      {username}
    </Text>,
    <Text key="question" style={[styles.questionText, { color: headlineColor }]}>
      How will you log in?
    </Text>,
    <View key="input" style={styles.inputContainer}>
      <View key="row" style={styles.inputRow}>
        <TextInput
          key="input"
          style={styles.textInput}
          mode="outlined"
          value={password}
          onChangeText={handlePasswordChange}
          autoCapitalize="none"
          secureTextEntry
          placeholder="Password"
          returnKeyType="done"
          onSubmitEditing={() => {
            if (isPasswordValid) {
              createAccount();
            }
          }}
          error={!!passwordError}
        />
        <Button
          key="submit"
          mode="contained"
          onPress={createAccount}
          loading={isRegistering}
          style={styles.registerButton}
        >
          Create Account
        </Button>
      </View>
      {passwordError ? (
        <HelperText key="error" type="error" visible style={styles.helperText}>
          {passwordError}
        </HelperText>
      ) : null}
    </View>,
    <Pressable key="back" style={styles.backButton} onPress={() => setSection('email')}>
      <Text style={[styles.backButtonArrow, { color: mutedColor }]}>‹</Text>
      <Text style={[styles.backButtonText, { color: mutedColor }]}>Edit email address</Text>
    </Pressable>,
  ];

  return (
    <View style={{ flex: 1 }}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: overlayColor }} />

      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: 20, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        {section === 'username' ? <View key="username">{usernameSection}</View> : null}
        {section === 'email' ? <View key="email">{emailSection}</View> : null}
        {section === 'password' ? <View key="password">{passwordSection}</View> : null}
      </ScrollView>
      <View style={styles.bottomContainer}>
        <PrivacyPolicy key="privacy" />
        <Button key="login" onPress={() => router.dismissTo('/login')}>
          I already have an account
        </Button>
      </View>
    </View>
  );
}

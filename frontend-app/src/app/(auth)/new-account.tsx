import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { Button, HelperText, TextInput } from 'react-native-paper';
import { zodResolver } from '@hookform/resolvers/zod';

import { useDialog } from '@/components/common/DialogProvider';
import { WEBSITE_URL } from '@/config';
import { useAuth } from '@/context/AuthProvider';
import { login, register } from '@/services/api/authentication';
import { newAccountSchema, type NewAccountFormValues } from '@/services/api/validation/userSchema';

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
  const url = WEBSITE_URL ? `${WEBSITE_URL}/privacy` : '/privacy';
  const textColor = colorScheme === 'dark' ? '#F5F5F5' : '#111111';

  return (
    <Text style={[styles.privacyText, { color: textColor }]}>
      By creating an account, you agree to our{' '}
      <Text
        style={[
          styles.privacyLink,
          colorScheme === 'dark' ? styles.privacyLinkDark : { color: textColor },
        ]}
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

  const {
    control,
    handleSubmit,
    trigger,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<NewAccountFormValues>({
    resolver: zodResolver(newAccountSchema),
    mode: 'onChange',
    defaultValues: { username: '', email: '', password: '' },
  });

  const [section, setSection] = useState<'username' | 'email' | 'password'>('username');
  const username = watch('username');

  const advanceFromUsername = async () => {
    const isValid = await trigger('username');
    if (isValid) setSection('email');
  };

  const advanceFromEmail = async () => {
    const isValid = await trigger('email');
    if (isValid) setSection('password');
  };

  const createAccount = handleSubmit(async (data: NewAccountFormValues) => {
    const result = await register(data.username, data.email, data.password);

    if (!result.success) {
      dialog.alert({
        title: 'Registration Failed',
        message: result.error || 'Account creation failed. Please try again.',
      });
      return;
    }

    const loginSuccess = await login(data.email, data.password);

    if (!loginSuccess) {
      dialog.alert({
        title: 'Account Created',
        message: 'Your account was created! Please log in.',
      });
      router.replace('/login');
      return;
    }

    try {
      await refetch(true);
    } catch (err) {
      console.error('[NewAccount] Failed to refetch user after signup:', err);
    }

    router.replace('/products');
  });

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
        <Controller
          control={control}
          name="username"
          render={({ field: { onChange, value } }) => (
            <TextInput
              style={styles.textInput}
              mode="outlined"
              value={value}
              onChangeText={onChange}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Username"
              returnKeyType="next"
              onSubmitEditing={advanceFromUsername}
              error={!!errors.username}
            />
          )}
        />
        <Pressable
          key="next"
          testID="username-next"
          accessibilityRole="button"
          accessibilityLabel="Continue to email"
          disabled={!!errors.username}
          onPress={advanceFromUsername}
          style={({ pressed }) => [
            styles.arrowButton,
            errors.username && styles.arrowButtonDisabled,
            pressed && !errors.username ? { opacity: 0.7 } : null,
          ]}
        >
          <Text style={[styles.arrowButtonText, { color: headlineColor }]}>›</Text>
        </Pressable>
      </View>
      {errors.username ? (
        <HelperText key="error" type="error" visible style={styles.helperText}>
          {errors.username.message}
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
        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, value } }) => (
            <TextInput
              style={styles.textInput}
              mode="outlined"
              value={value}
              onChangeText={onChange}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="Email address"
              returnKeyType="next"
              onSubmitEditing={advanceFromEmail}
              error={!!errors.email}
            />
          )}
        />
        <Pressable
          key="next"
          testID="email-next"
          accessibilityRole="button"
          accessibilityLabel="Continue to password"
          disabled={!!errors.email}
          onPress={advanceFromEmail}
          style={({ pressed }) => [
            styles.arrowButton,
            errors.email && styles.arrowButtonDisabled,
            pressed && !errors.email ? { opacity: 0.7 } : null,
          ]}
        >
          <Text style={[styles.arrowButtonText, { color: headlineColor }]}>›</Text>
        </Pressable>
      </View>
      {errors.email ? (
        <HelperText key="error" type="error" visible style={styles.helperText}>
          {errors.email.message}
        </HelperText>
      ) : null}
    </View>,
    <Pressable
      key="back"
      style={styles.backButton}
      onPress={() => setSection('username')}
      accessibilityRole="button"
      accessibilityLabel="Go back to edit username"
    >
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
        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, value } }) => (
            <TextInput
              style={styles.textInput}
              mode="outlined"
              value={value}
              onChangeText={onChange}
              autoCapitalize="none"
              secureTextEntry
              placeholder="Password"
              returnKeyType="done"
              onSubmitEditing={() => {
                if (!errors.password) {
                  createAccount();
                }
              }}
              error={!!errors.password}
            />
          )}
        />
        <Button
          key="submit"
          mode="contained"
          onPress={createAccount}
          loading={isSubmitting}
          style={styles.registerButton}
        >
          Create Account
        </Button>
      </View>
      {errors.password ? (
        <HelperText key="error" type="error" visible style={styles.helperText}>
          {errors.password.message}
        </HelperText>
      ) : null}
    </View>,
    <Pressable
      key="back"
      style={styles.backButton}
      onPress={() => setSection('email')}
      accessibilityRole="button"
      accessibilityLabel="Go back to edit email address"
    >
      <Text style={[styles.backButtonArrow, { color: mutedColor }]}>‹</Text>
      <Text style={[styles.backButtonText, { color: mutedColor }]}>Edit email address</Text>
    </Pressable>,
  ];

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: overlayColor,
        }}
      />

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

import type { ReactNode } from 'react';
import type { Control, FieldErrors } from 'react-hook-form';
import { Controller } from 'react-hook-form';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, HelperText, TextInput } from 'react-native-paper';
import { WEBSITE_URL } from '@/config';
import type { NewAccountFormValues } from '@/services/api/validation/userSchema';

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

type SharedStepProps = {
  control: Control<NewAccountFormValues>;
  errors: FieldErrors<NewAccountFormValues>;
  headlineColor: string;
  mutedColor: string;
};

export function PrivacyPolicy({ colorScheme }: { colorScheme: 'light' | 'dark' }) {
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
}

export function NewAccountUsernameStep({
  control,
  errors,
  headlineColor,
  onAdvance,
}: SharedStepProps & { onAdvance: () => void }) {
  return (
    <View>
      <Text style={[styles.welcomeText, { color: headlineColor }]}>Welcome to</Text>
      <Text style={[styles.brandText, { color: headlineColor }]}>RELab</Text>
      <Text style={[styles.questionText, { color: headlineColor }]}>Who are you?</Text>
      <View style={styles.inputContainer}>
        <View style={styles.inputRow}>
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
                onSubmitEditing={onAdvance}
                error={Boolean(errors.username)}
              />
            )}
          />
          <Pressable
            testID="username-next"
            accessibilityRole="button"
            accessibilityLabel="Continue to email"
            disabled={Boolean(errors.username)}
            onPress={onAdvance}
            style={({ pressed }) => [
              styles.arrowButton,
              errors.username ? styles.arrowButtonDisabled : null,
              pressed && !errors.username ? { opacity: 0.7 } : null,
            ]}
          >
            <Text style={[styles.arrowButtonText, { color: headlineColor }]}>›</Text>
          </Pressable>
        </View>
        {errors.username ? (
          <HelperText type="error" visible style={styles.helperText}>
            {errors.username.message}
          </HelperText>
        ) : null}
      </View>
    </View>
  );
}

export function NewAccountEmailStep({
  control,
  errors,
  headlineColor,
  mutedColor,
  username,
  onAdvance,
  onBack,
}: SharedStepProps & {
  username: string;
  onAdvance: () => void;
  onBack: () => void;
}) {
  return (
    <View>
      <Text style={[styles.welcomeText, { color: headlineColor }]}>Hi</Text>
      <Text style={[styles.brandText, { color: headlineColor }]}>{username}</Text>
      <Text style={[styles.questionText, { color: headlineColor }]}>How do we reach you?</Text>
      <View style={styles.inputContainer}>
        <View style={styles.inputRow}>
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
                onSubmitEditing={onAdvance}
                error={Boolean(errors.email)}
              />
            )}
          />
          <Pressable
            testID="email-next"
            accessibilityRole="button"
            accessibilityLabel="Continue to password"
            disabled={Boolean(errors.email)}
            onPress={onAdvance}
            style={({ pressed }) => [
              styles.arrowButton,
              errors.email ? styles.arrowButtonDisabled : null,
              pressed && !errors.email ? { opacity: 0.7 } : null,
            ]}
          >
            <Text style={[styles.arrowButtonText, { color: headlineColor }]}>›</Text>
          </Pressable>
        </View>
        {errors.email ? (
          <HelperText type="error" visible style={styles.helperText}>
            {errors.email.message}
          </HelperText>
        ) : null}
      </View>
      <Pressable
        style={styles.backButton}
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Go back to edit username"
      >
        <Text style={[styles.backButtonArrow, { color: mutedColor }]}>‹</Text>
        <Text style={[styles.backButtonText, { color: mutedColor }]}>Edit username</Text>
      </Pressable>
    </View>
  );
}

export function NewAccountPasswordStep({
  control,
  errors,
  headlineColor,
  mutedColor,
  username,
  isSubmitting,
  onSubmit,
  onBack,
}: SharedStepProps & {
  username: string;
  isSubmitting: boolean;
  onSubmit: () => void;
  onBack: () => void;
}) {
  return (
    <View>
      <Text style={[styles.welcomeText, { color: headlineColor }]}>Finally,</Text>
      <Text style={[styles.brandText, { color: headlineColor }]}>{username}</Text>
      <Text style={[styles.questionText, { color: headlineColor }]}>How will you log in?</Text>
      <View style={styles.inputContainer}>
        <View style={styles.inputRow}>
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
                onSubmitEditing={onSubmit}
                error={Boolean(errors.password)}
              />
            )}
          />
          <Button
            mode="contained"
            onPress={onSubmit}
            loading={isSubmitting}
            style={styles.registerButton}
          >
            Create Account
          </Button>
        </View>
        {errors.password ? (
          <HelperText type="error" visible style={styles.helperText}>
            {errors.password.message}
          </HelperText>
        ) : null}
      </View>
      <Pressable
        style={styles.backButton}
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Go back to edit email address"
      >
        <Text style={[styles.backButtonArrow, { color: mutedColor }]}>‹</Text>
        <Text style={[styles.backButtonText, { color: mutedColor }]}>Edit email address</Text>
      </Pressable>
    </View>
  );
}

type NewAccountLayoutProps = {
  overlayColor: string;
  colorScheme: 'light' | 'dark';
  children: ReactNode;
  onNavigateToLogin: () => void;
};

export function NewAccountLayout({
  overlayColor,
  colorScheme,
  children,
  onNavigateToLogin,
}: NewAccountLayoutProps) {
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
        {children}
      </ScrollView>

      <View style={styles.bottomContainer}>
        <PrivacyPolicy colorScheme={colorScheme} />
        <Button onPress={onNavigateToLogin}>I already have an account</Button>
      </View>
    </View>
  );
}

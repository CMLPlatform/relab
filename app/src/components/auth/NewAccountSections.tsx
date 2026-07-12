import { type ComponentProps, type ReactNode, useCallback } from 'react';
import type { Control, ControllerRenderProps, FieldErrors } from 'react-hook-form';
import { Controller } from 'react-hook-form';
import {
  Pressable,
  type PressableStateCallbackType,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button, HelperText, TextInput } from 'react-native-paper';
import { WEBSITE_URL } from '@/config';
import type { NewAccountFormValues } from '@/services/api/validation/userSchema';
import { openExternalUrl } from '@/services/externalLinks';
import { useAppTheme } from '@/theme';
import { textGlow } from '@/utils/platformLayout';

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
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
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
    marginRight: 4,
    lineHeight: 18,
  },
  backButtonText: {
    fontSize: 13,
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

type SharedStepProps = {
  control: Control<NewAccountFormValues>;
  errors: FieldErrors<NewAccountFormValues>;
  headlineColor: string;
  mutedColor: string;
};

export function PrivacyPolicy() {
  const theme = useAppTheme();
  const url = WEBSITE_URL ? new URL('/privacy', WEBSITE_URL).toString() : '';
  const textColor = theme.colors.onBackground;
  const openPrivacy = useCallback(() => {
    if (url) {
      void openExternalUrl(url);
    }
  }, [url]);

  return (
    <Text style={[styles.privacyText, { color: textColor }]}>
      By creating an account, you agree to our{' '}
      <Text
        style={[styles.privacyLink, { color: textColor }]}
        onPress={openPrivacy}
        accessibilityRole="link"
      >
        Privacy Policy
      </Text>
    </Text>
  );
}

type StepFieldName = 'username' | 'email' | 'password';

function NewAccountStep({
  control,
  errors,
  headlineColor,
  mutedColor,
  field,
  lines,
  inputProps,
  next,
  submit,
  back,
}: SharedStepProps & {
  field: StepFieldName;
  lines: [string, string, string];
  inputProps: ComponentProps<typeof TextInput>;
  next?: { testID: string; accessibilityLabel: string; onPress: () => void };
  submit?: { isSubmitting: boolean; onPress: () => void };
  back?: { label: string; accessibilityLabel: string; onPress: () => void };
}) {
  const theme = useAppTheme();
  const glow = textGlow(theme.dark ? theme.colors.scrim : theme.colors.background);
  const error = errors[field];
  const renderInput = useCallback(
    ({ field: { onChange, value } }: { field: ControllerRenderProps<NewAccountFormValues> }) => (
      <TextInput
        style={styles.textInput}
        mode="outlined"
        value={value}
        onChangeText={onChange}
        autoCapitalize="none"
        error={Boolean(error)}
        {...inputProps}
      />
    ),
    [error, inputProps],
  );
  const arrowStyle = useCallback(
    ({ pressed }: PressableStateCallbackType) => [
      styles.arrowButton,
      error ? styles.arrowButtonDisabled : null,
      pressed && !error ? { opacity: 0.7 } : null,
    ],
    [error],
  );

  return (
    <View>
      <Text style={[styles.welcomeText, { color: headlineColor }, glow]}>{lines[0]}</Text>
      <Text style={[styles.brandText, { color: headlineColor }, glow]}>{lines[1]}</Text>
      <Text style={[styles.questionText, { color: headlineColor }, glow]}>{lines[2]}</Text>
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.tokens.surface.card,
            borderColor: theme.tokens.border.subtle,
          },
        ]}
      >
        <View style={styles.inputContainer}>
          <View style={styles.inputRow}>
            <Controller control={control} name={field} render={renderInput} />
            {next ? (
              <Pressable
                testID={next.testID}
                accessibilityRole="button"
                accessibilityLabel={next.accessibilityLabel}
                disabled={Boolean(error)}
                onPress={next.onPress}
                style={arrowStyle}
              >
                <Text style={[styles.arrowButtonText, { color: headlineColor }]}>›</Text>
              </Pressable>
            ) : null}
            {submit ? (
              <Button
                mode="contained"
                onPress={submit.onPress}
                loading={submit.isSubmitting}
                style={styles.registerButton}
              >
                Create account
              </Button>
            ) : null}
          </View>
          {error ? (
            <HelperText type="error" visible style={styles.helperText}>
              {error.message}
            </HelperText>
          ) : null}
        </View>
        {back ? (
          <Pressable
            style={styles.backButton}
            onPress={back.onPress}
            accessibilityRole="button"
            accessibilityLabel={back.accessibilityLabel}
          >
            <Text style={[styles.backButtonArrow, { color: mutedColor }]}>‹</Text>
            <Text style={[styles.backButtonText, { color: mutedColor }]}>{back.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function NewAccountUsernameStep({
  onAdvance,
  ...shared
}: SharedStepProps & { onAdvance: () => void }) {
  return (
    <NewAccountStep
      {...shared}
      field="username"
      lines={['Welcome to', 'ReLab', 'Who are you?']}
      inputProps={{
        autoCorrect: false,
        autoComplete: 'username-new',
        textContentType: 'username',
        placeholder: 'Username',
        returnKeyType: 'next',
        onSubmitEditing: onAdvance,
      }}
      next={{
        testID: 'username-next',
        accessibilityLabel: 'Continue to email',
        onPress: onAdvance,
      }}
    />
  );
}

export function NewAccountEmailStep({
  username,
  onAdvance,
  onBack,
  ...shared
}: SharedStepProps & {
  username: string;
  onAdvance: () => void;
  onBack: () => void;
}) {
  return (
    <NewAccountStep
      {...shared}
      field="email"
      lines={['Hi', username, 'How do we reach you?']}
      inputProps={{
        autoCorrect: false,
        autoComplete: 'email',
        textContentType: 'emailAddress',
        keyboardType: 'email-address',
        placeholder: 'Email address',
        returnKeyType: 'next',
        onSubmitEditing: onAdvance,
      }}
      next={{
        testID: 'email-next',
        accessibilityLabel: 'Continue to password',
        onPress: onAdvance,
      }}
      back={{
        label: 'Edit username',
        accessibilityLabel: 'Go back to edit username',
        onPress: onBack,
      }}
    />
  );
}

export function NewAccountPasswordStep({
  username,
  isSubmitting,
  onSubmit,
  onBack,
  ...shared
}: SharedStepProps & {
  username: string;
  isSubmitting: boolean;
  onSubmit: () => void;
  onBack: () => void;
}) {
  return (
    <NewAccountStep
      {...shared}
      field="password"
      lines={['Finally,', username, 'How will you log in?']}
      inputProps={{
        autoComplete: 'password-new',
        textContentType: 'newPassword',
        secureTextEntry: true,
        placeholder: 'Password',
        returnKeyType: 'done',
        onSubmitEditing: onSubmit,
      }}
      submit={{ isSubmitting, onPress: onSubmit }}
      back={{
        label: 'Edit email address',
        accessibilityLabel: 'Go back to edit email address',
        onPress: onBack,
      }}
    />
  );
}

type NewAccountLayoutProps = {
  children: ReactNode;
  onNavigateToLogin: () => void;
};

export function NewAccountLayout({ children, onNavigateToLogin }: NewAccountLayoutProps) {
  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: 20, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>

      <View style={styles.bottomContainer}>
        <PrivacyPolicy />
        <Button onPress={onNavigateToLogin}>I already have an account</Button>
      </View>
    </View>
  );
}

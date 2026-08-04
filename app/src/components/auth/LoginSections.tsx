import { type RefObject, useCallback } from 'react';
import type { Control, ControllerFieldState, ControllerRenderProps } from 'react-hook-form';
import { Controller } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { BrandWordmark } from '@/components/base/BrandWordmark';
import { FormFieldError } from '@/components/base/FormField';
import { Icon } from '@/components/base/Icon';
import { TextInput } from '@/components/base/TextInput';
import { radius } from '@/constants';
import type { LoginFormValues } from '@/services/api/validation/userSchema';
import { useAppTheme } from '@/theme';
import { describedBy } from '@/utils/a11y';

// shared frame so the auth card and the logo wash read as one family
const cardFrame = {
  borderRadius: radius.card,
  borderWidth: StyleSheet.hairlineWidth,
} as const;

type LoginLayoutProps = {
  children: React.ReactNode;
  onBrowse: () => void;
};

export function LoginLayout({ children, onBrowse }: LoginLayoutProps) {
  const theme = useAppTheme();
  return (
    <View style={styles.root}>
      <AppButton
        variant="ghost"
        onPress={onBrowse}
        className="self-start absolute top-4 left-2 z-10"
      >
        <Icon name="arrow-left" size={16} color={theme.colors.onSurface} />
        <AppText style={{ color: theme.colors.onSurface }}>Browse</AppText>
      </AppButton>

      <AuthScreen>
        <View style={styles.stack}>{children}</View>
      </AuthScreen>
    </View>
  );
}

export function LoginCard({ children }: { children: React.ReactNode }) {
  const theme = useAppTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.tokens.surface.card, borderColor: theme.tokens.border.subtle },
      ]}
    >
      {children}
    </View>
  );
}

export function LoginBrandHero() {
  // No wash behind the mark: the hero scrim's centre band already calms the
  // backdrop here, and the logo is a high-contrast shape that reads without a
  // panel of its own. One less surface between the brand and the photo.
  return (
    <View style={styles.brandWash}>
      <BrandWordmark style={styles.brandLogo} />
    </View>
  );
}

type LoginFormSectionProps = {
  control: Control<LoginFormValues>;
  emailRef: RefObject<{ focus(): void } | null>;
  onSubmit: () => void;
  onForgotPassword: () => void;
};

export function LoginFormSection({
  control,
  emailRef,
  onSubmit,
  onForgotPassword,
}: LoginFormSectionProps) {
  const theme = useAppTheme();
  const setEmailRef = useCallback(
    (instance: { focus(): void } | null) => {
      emailRef.current = instance;
    },
    [emailRef],
  );
  const renderEmail = useCallback(
    ({
      field: { onChange, value },
      fieldState,
    }: {
      field: ControllerRenderProps<LoginFormValues, 'email'>;
      fieldState: ControllerFieldState;
    }) => {
      const { error } = fieldState;
      return (
        <View style={styles.field}>
          <AppText variant="label">Email or username</AppText>
          <TextInput
            ref={setEmailRef}
            value={value}
            onChangeText={onChange}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            accessibilityLabel="Email or username"
            placeholder="e.g. you@university.edu"
            {...describedBy('login-email-error', Boolean(error))}
            style={[
              styles.input,
              { borderColor: error ? theme.tokens.status.danger : theme.colors.outline },
            ]}
          />
          <FormFieldError errorId="login-email-error" message={error?.message} />
        </View>
      );
    },
    [setEmailRef, theme.colors.outline, theme.tokens.status.danger],
  );
  const renderPassword = useCallback(
    ({
      field: { onChange, value },
      fieldState,
    }: {
      field: ControllerRenderProps<LoginFormValues, 'password'>;
      fieldState: ControllerFieldState;
    }) => {
      const { error } = fieldState;
      return (
        <View style={styles.field}>
          <AppText variant="label">Password</AppText>
          <TextInput
            value={value}
            onChangeText={onChange}
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            secureTextEntry
            accessibilityLabel="Password"
            onSubmitEditing={onSubmit}
            {...describedBy('login-password-error', Boolean(error))}
            style={[
              styles.input,
              { borderColor: error ? theme.tokens.status.danger : theme.colors.outline },
            ]}
          />
          <FormFieldError errorId="login-password-error" message={error?.message} />
        </View>
      );
    },
    [onSubmit, theme.colors.outline, theme.tokens.status.danger],
  );

  return (
    <>
      <Controller control={control} name="email" render={renderEmail} />
      <Controller control={control} name="password" render={renderPassword} />
      <AppButton variant="primary" className="w-full" onPress={onSubmit}>
        Sign in
      </AppButton>
      <AppButton variant="ghost" onPress={onForgotPassword} className="self-end">
        Forgot password?
      </AppButton>
    </>
  );
}

export function LoginDivider() {
  const theme = useAppTheme();
  return (
    <View style={styles.dividerRow}>
      <View style={[styles.dividerLine, { backgroundColor: theme.colors.outline }]} />
      <AppText style={styles.dividerText}>or</AppText>
      <View style={[styles.dividerLine, { backgroundColor: theme.colors.outline }]} />
    </View>
  );
}

type LoginOAuthSectionProps = {
  onGoogle: () => void;
  onGithub: () => void;
};

export function LoginOAuthSection({ onGoogle, onGithub }: LoginOAuthSectionProps) {
  const theme = useAppTheme();
  return (
    <>
      <AppButton variant="outline" className="w-full" onPress={onGoogle}>
        <Icon name="google" size="sm" color={theme.colors.onSurface} />
        <AppText style={{ color: theme.colors.onSurface }}>Continue with Google</AppText>
      </AppButton>
      <AppButton variant="outline" className="w-full" onPress={onGithub}>
        <Icon name="github" size="sm" color={theme.colors.onSurface} />
        <AppText style={{ color: theme.colors.onSurface }}>Continue with GitHub</AppText>
      </AppButton>
    </>
  );
}

export function LoginSecondaryAction({ onCreateAccount }: { onCreateAccount: () => void }) {
  return (
    <AppButton variant="tonal" onPress={onCreateAccount} className="w-full mt-1">
      Create a new account
    </AppButton>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  stack: {
    gap: 12,
  },
  card: {
    ...cardFrame,
    padding: 16,
    gap: 10,
  },
  brandWash: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    marginBottom: 4,
  },
  brandLogo: {
    width: '100%',
  },
  // A visible name that survives typing: the placeholder used to be the only
  // label, and it disappears the moment the field has a value.
  field: {
    gap: 4,
  },
  input: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    opacity: 0.3,
  },
  dividerText: {
    marginHorizontal: 10,
    opacity: 0.5,
  },
});

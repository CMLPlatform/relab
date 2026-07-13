import { type RefObject, useCallback } from 'react';
import type { Control, ControllerRenderProps } from 'react-hook-form';
import { Controller } from 'react-hook-form';
import { Keyboard, StyleSheet, View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import { BrandWordmark } from '@/components/base/BrandWordmark';
import type { LoginFormValues } from '@/services/api/validation/userSchema';
import { useAppTheme } from '@/theme';

// shared frame so the auth card and the logo wash read as one family
const cardFrame = {
  borderRadius: 16,
  borderWidth: StyleSheet.hairlineWidth,
} as const;

type LoginLayoutProps = {
  keyboardShown: boolean;
  children: React.ReactNode;
  onBrowse: () => void;
};

export function LoginLayout({ keyboardShown, children, onBrowse }: LoginLayoutProps) {
  const theme = useAppTheme();
  const keyboardHeight = keyboardShown && Keyboard.metrics() ? Keyboard.metrics()?.height : 0;
  return (
    <View style={styles.root}>
      <Button mode="text" icon="arrow-left" onPress={onBrowse} style={styles.browseButton} compact>
        Browse
      </Button>

      <View style={[styles.overlayContent, { bottom: keyboardHeight }]}>{children}</View>

      <View
        style={[
          styles.keyboardFill,
          { height: keyboardHeight, backgroundColor: theme.colors.background },
        ]}
      />
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
  const theme = useAppTheme();
  return (
    <View
      style={[
        styles.brandWash,
        { backgroundColor: theme.tokens.surface.card, borderColor: theme.tokens.border.subtle },
      ]}
    >
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
  const setEmailRef = useCallback(
    (instance: { focus(): void } | null) => {
      emailRef.current = instance;
    },
    [emailRef],
  );
  const renderEmail = useCallback(
    ({
      field: { onChange, value },
    }: {
      field: ControllerRenderProps<LoginFormValues, 'email'>;
    }) => (
      <TextInput
        ref={setEmailRef}
        mode="outlined"
        value={value}
        onChangeText={onChange}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        textContentType="username"
        placeholder="Email or username"
      />
    ),
    [setEmailRef],
  );
  const renderPassword = useCallback(
    ({
      field: { onChange, value },
    }: {
      field: ControllerRenderProps<LoginFormValues, 'password'>;
    }) => (
      <TextInput
        mode="outlined"
        value={value}
        onChangeText={onChange}
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
        secureTextEntry
        placeholder="Password"
        onSubmitEditing={onSubmit}
      />
    ),
    [onSubmit],
  );

  return (
    <>
      <Controller control={control} name="email" render={renderEmail} />
      <Controller control={control} name="password" render={renderPassword} />
      <Button mode="contained" style={{ width: '100%', padding: 5 }} onPress={onSubmit}>
        Sign in
      </Button>
      <Button mode="text" compact onPress={onForgotPassword} style={{ alignSelf: 'flex-end' }}>
        Forgot password?
      </Button>
    </>
  );
}

export function LoginDivider() {
  const theme = useAppTheme();
  return (
    <View style={styles.dividerRow}>
      <View style={[styles.dividerLine, { backgroundColor: theme.colors.outline }]} />
      <Text style={styles.dividerText}>or</Text>
      <View style={[styles.dividerLine, { backgroundColor: theme.colors.outline }]} />
    </View>
  );
}

type LoginOAuthSectionProps = {
  onGoogle: () => void;
  onGithub: () => void;
};

export function LoginOAuthSection({ onGoogle, onGithub }: LoginOAuthSectionProps) {
  return (
    <>
      <Button mode="outlined" icon="google" style={{ width: '100%' }} onPress={onGoogle}>
        Continue with Google
      </Button>
      <Button mode="outlined" icon="github" style={{ width: '100%' }} onPress={onGithub}>
        Continue with GitHub
      </Button>
    </>
  );
}

export function LoginSecondaryAction({ onCreateAccount }: { onCreateAccount: () => void }) {
  const theme = useAppTheme();

  return (
    <Button
      mode="contained-tonal"
      buttonColor={theme.colors.secondaryContainer}
      textColor={theme.colors.onSecondaryContainer}
      onPress={onCreateAccount}
      style={styles.secondaryAction}
    >
      Create a new account
    </Button>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  browseButton: {
    position: 'absolute',
    top: 16,
    left: 8,
    zIndex: 10,
  },
  overlayContent: {
    padding: 20,
    gap: 10,
    position: 'absolute',
    width: '100%',
  },
  card: {
    ...cardFrame,
    padding: 16,
    gap: 10,
  },
  keyboardFill: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
  },
  // Translucent wash behind the logo (same frame as the auth card) so the
  // mark stays legible over the photo backdrop. Sizing lives here: the
  // percentage binds on phones, maxWidth caps tablets/web.
  brandWash: {
    ...cardFrame,
    width: '78%',
    maxWidth: 480,
    alignSelf: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 18,
    marginBottom: 4,
  },
  brandLogo: {
    width: '100%',
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
  secondaryAction: {
    width: '100%',
    marginTop: 4,
  },
});

import { LinearGradient } from 'expo-linear-gradient';
import type { RefObject } from 'react';
import type { Control } from 'react-hook-form';
import { Controller } from 'react-hook-form';
import type { TextStyle } from 'react-native';
import { Keyboard, Platform, StyleSheet, View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import type { LoginFormValues } from '@/services/api/validation/userSchema';
import { useAppTheme } from '@/theme';

type LoginLayoutProps = {
  colorScheme: 'light' | 'dark';
  keyboardShown: boolean;
  children: React.ReactNode;
  onBrowse: () => void;
};

export function LoginLayout({ colorScheme, keyboardShown, children, onBrowse }: LoginLayoutProps) {
  const theme = useAppTheme();
  void colorScheme;
  const keyboardHeight = keyboardShown && Keyboard.metrics() ? Keyboard.metrics()?.height : 0;
  return (
    <View style={styles.root}>
      <Button mode="text" icon="arrow-left" onPress={onBrowse} style={styles.browseButton} compact>
        Browse
      </Button>

      <View style={[styles.overlayContent, { bottom: keyboardHeight }]}>
        <LinearGradient
          colors={['transparent', theme.colors.background]}
          style={StyleSheet.absoluteFillObject}
        />
        {children}
      </View>

      <View
        style={[
          styles.keyboardFill,
          { height: keyboardHeight, backgroundColor: theme.colors.background },
        ]}
      />
    </View>
  );
}

export function LoginBrandHero({ colorScheme }: { colorScheme: 'light' | 'dark' }) {
  const theme = useAppTheme();
  const shadowColor = colorScheme === 'light' ? theme.colors.background : theme.colors.scrim;
  const shadowStyle = (
    Platform.OS === 'web'
      ? { textShadow: `0px 0px 10px ${shadowColor}` }
      : { textShadowColor: shadowColor }
  ) as TextStyle;
  return <Text style={[styles.brandHero, shadowStyle]}>RELab</Text>;
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
  return (
    <>
      <Controller
        control={control}
        name="email"
        render={({ field: { onChange, value } }) => (
          <TextInput
            ref={(instance: { focus(): void } | null) => {
              emailRef.current = instance;
            }}
            mode="outlined"
            value={value}
            onChangeText={onChange}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            placeholder="Email or username"
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field: { onChange, value } }) => (
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
        )}
      />
      <Button mode="contained" style={{ width: '100%', padding: 5 }} onPress={onSubmit}>
        Login
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
  keyboardFill: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
  },
  brandHero: {
    fontSize: 48,
    fontWeight: 'bold',
    textAlign: 'left',
    ...(Platform.OS === 'web'
      ? {}
      : {
          textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: 10,
        }),
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

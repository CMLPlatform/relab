import { LinearGradient } from 'expo-linear-gradient';
import type { RefObject } from 'react';
import type { Control } from 'react-hook-form';
import { Controller } from 'react-hook-form';
import { Keyboard, View } from 'react-native';
import { Button, Text, TextInput, useTheme } from 'react-native-paper';
import type { LoginFormValues } from '@/services/api/validation/userSchema';

type LoginLayoutProps = {
  colorScheme: 'light' | 'dark';
  keyboardShown: boolean;
  children: React.ReactNode;
  onBrowse: () => void;
};

export function LoginLayout({ colorScheme, keyboardShown, children, onBrowse }: LoginLayoutProps) {
  return (
    <View style={{ flex: 1 }}>
      <Button
        mode="text"
        icon="arrow-left"
        onPress={onBrowse}
        style={{ position: 'absolute', top: 16, left: 8, zIndex: 10 }}
        compact
      >
        Browse
      </Button>

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
          colors={['transparent', colorScheme === 'light' ? 'white' : 'black']}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
        />
        {children}
      </View>

      <View
        style={{
          position: 'absolute',
          bottom: 0,
          height: keyboardShown && Keyboard.metrics() ? Keyboard.metrics()?.height : 0,
          width: '100%',
          backgroundColor: colorScheme === 'light' ? 'white' : 'black',
        }}
      />
    </View>
  );
}

export function LoginBrandHero({ colorScheme }: { colorScheme: 'light' | 'dark' }) {
  return (
    <Text
      style={{
        fontSize: 48,
        fontWeight: 'bold',
        textAlign: 'left',
        textShadowColor: colorScheme === 'light' ? 'white' : 'black',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 10,
      }}
    >
      RELab
    </Text>
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
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 4 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: 'grey', opacity: 0.3 }} />
      <Text style={{ marginHorizontal: 10, opacity: 0.5 }}>or</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: 'grey', opacity: 0.3 }} />
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
  const theme = useTheme();

  return (
    <Button
      mode="contained-tonal"
      buttonColor={theme.colors.secondaryContainer}
      textColor={theme.colors.onSecondaryContainer}
      onPress={onCreateAccount}
      style={{ width: '100%', marginTop: 4 }}
    >
      Create a new account
    </Button>
  );
}

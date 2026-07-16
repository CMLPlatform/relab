import { MaterialCommunityIcons } from '@expo/vector-icons';
import { type RefObject, useCallback } from 'react';
import type { Control, ControllerRenderProps } from 'react-hook-form';
import { Controller } from 'react-hook-form';
import { Keyboard, StyleSheet, View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { BrandWordmark } from '@/components/base/BrandWordmark';
import { TextInput } from '@/components/base/TextInput';
import { useIsDesktop } from '@/hooks/useIsDesktop';
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
  const isDesktop = useIsDesktop();
  const keyboardHeight = keyboardShown && Keyboard.metrics() ? Keyboard.metrics()?.height : 0;

  const browse = (
    <AppButton variant="ghost" onPress={onBrowse} className="self-start absolute top-4 left-2 z-10">
      <MaterialCommunityIcons name="arrow-left" size={16} color={theme.colors.onSurface} />
      <AppText style={{ color: theme.colors.onSurface }}>Browse</AppText>
    </AppButton>
  );

  // Desktop has no software keyboard, so the phone's bottom-sheet framing turns
  // into a full-width bar pinned to the viewport floor. Center a constrained
  // column over the backdrop instead — the readable-measure auth pattern.
  if (isDesktop) {
    return (
      <View style={styles.root}>
        {browse}
        <View style={styles.desktopCenter}>
          <View style={styles.desktopColumn}>{children}</View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {browse}

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
  const isDesktop = useIsDesktop();
  return (
    <View
      style={[
        styles.brandWash,
        // In the centered desktop column, fill the width so the wash lines up
        // with the card edges; the phone bottom sheet keeps the 78% left inset.
        isDesktop && styles.brandWashDesktop,
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
    }: {
      field: ControllerRenderProps<LoginFormValues, 'email'>;
    }) => (
      <TextInput
        ref={setEmailRef}
        value={value}
        onChangeText={onChange}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        textContentType="username"
        placeholder="Email or username"
        style={[styles.input, { borderColor: theme.colors.outline }]}
      />
    ),
    [setEmailRef, theme.colors.outline],
  );
  const renderPassword = useCallback(
    ({
      field: { onChange, value },
    }: {
      field: ControllerRenderProps<LoginFormValues, 'password'>;
    }) => (
      <TextInput
        value={value}
        onChangeText={onChange}
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
        secureTextEntry
        placeholder="Password"
        onSubmitEditing={onSubmit}
        style={[styles.input, { borderColor: theme.colors.outline }]}
      />
    ),
    [onSubmit, theme.colors.outline],
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
        <MaterialCommunityIcons name="google" size={16} color={theme.colors.onSurface} />
        <AppText style={{ color: theme.colors.onSurface }}>Continue with Google</AppText>
      </AppButton>
      <AppButton variant="outline" className="w-full" onPress={onGithub}>
        <MaterialCommunityIcons name="github" size={16} color={theme.colors.onSurface} />
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
  overlayContent: {
    padding: 20,
    gap: 10,
    position: 'absolute',
    width: '100%',
  },
  desktopCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  desktopColumn: {
    width: '100%',
    maxWidth: 420,
    gap: 12,
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
  brandWashDesktop: {
    width: '100%',
    maxWidth: undefined,
    alignSelf: 'stretch',
  },
  brandLogo: {
    width: '100%',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
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

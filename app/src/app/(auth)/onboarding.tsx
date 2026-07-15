import { zodResolver } from '@hookform/resolvers/zod';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Keyboard, Platform, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { BrandWordmark } from '@/components/base/BrandWordmark';
import { useDialog } from '@/components/base/dialogContext';
import { TextInput } from '@/components/base/TextInput';
import { useAuth } from '@/context/auth';
import { updateUser } from '@/services/api/auth/authentication';
import { type OnboardingFormValues, onboardingSchema } from '@/services/api/validation/userSchema';
import { type AppTheme, memoizeByTheme, useAppTheme } from '@/theme';
import { getErrorMessage } from '@/utils/errors';
import { textGlow } from '@/utils/platformLayout';

function getKeyboardHeight() {
  return Platform.OS !== 'web' && Keyboard.metrics() ? Keyboard.metrics()?.height : 0;
}

function OnboardingBody({
  control,
  submitUsername,
  isSubmitting,
  isValid,
}: {
  control: ReturnType<typeof useForm<OnboardingFormValues>>['control'];
  submitUsername: () => void;
  isSubmitting: boolean;
  isValid: boolean;
}) {
  const theme = useAppTheme();
  const textShadowStyle = textGlow(theme.colors.background);
  const styles = createStyles(theme);
  const renderUsername = useCallback(
    ({
      field: { onChange, value },
    }: {
      field: { onChange: (text: string) => void; value: string };
    }) => (
      <TextInput
        value={value}
        onChangeText={onChange}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="e.g. awesome_user"
        accessibilityLabel="Username"
        onSubmitEditing={submitUsername}
        style={[
          styles.input,
          { borderColor: theme.colors.outline, backgroundColor: theme.tokens.surface.card },
        ]}
      />
    ),
    [submitUsername, theme.colors.outline, theme.tokens.surface.card, styles.input],
  );

  return (
    <View style={[styles.body, { bottom: getKeyboardHeight() }]}>
      <LinearGradient colors={['transparent', theme.colors.background]} style={styles.gradient} />
      <BrandWordmark style={styles.brandLogo} />
      <AppText style={[styles.title, textShadowStyle]}>Welcome!</AppText>
      <AppText style={[styles.subtitle, textShadowStyle]}>Choose a username to continue.</AppText>
      <Controller control={control} name="username" render={renderUsername} />
      <AppButton
        variant="primary"
        loading={isSubmitting}
        disabled={isSubmitting || !isValid}
        className="w-full"
        onPress={submitUsername}
      >
        Continue
      </AppButton>
    </View>
  );
}

function OnboardingKeyboardSpacer() {
  const theme = useAppTheme();
  const styles = createStyles(theme);
  return <View style={[styles.keyboardSpacer, { height: getKeyboardHeight() }]} />;
}

export default function Onboarding() {
  const router = useRouter();
  const dialog = useDialog();
  const { refetch } = useAuth();
  const theme = useAppTheme();
  const styles = createStyles(theme);

  const {
    control,
    handleSubmit,
    formState: { isValid, isSubmitting },
  } = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingSchema),
    mode: 'onChange',
    defaultValues: { username: '' },
  });

  const submitUsername = handleSubmit(async (data: OnboardingFormValues) => {
    try {
      await updateUser({ username: data.username });
      await refetch(false);
      router.replace({ pathname: '/products', params: { authenticated: 'true' } });
    } catch (error: unknown) {
      dialog.alert({
        title: "Couldn't save username",
        message: getErrorMessage(error, 'It might already be taken.'),
      });
    }
  });

  return (
    <View style={styles.container}>
      <OnboardingBody
        control={control}
        submitUsername={submitUsername}
        isSubmitting={isSubmitting}
        isValid={isValid}
      />
      <OnboardingKeyboardSpacer />
    </View>
  );
}

const createStyles = memoizeByTheme((theme: AppTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    body: {
      padding: 20,
      gap: 15,
      position: 'absolute',
      width: '100%',
    },
    gradient: {
      position: 'absolute',
      top: -50,
      left: 0,
      right: 0,
      bottom: 0,
    },
    brandLogo: {
      width: 220,
      alignSelf: 'center',
    },
    title: {
      fontSize: 32,
      fontWeight: 'bold',
      textAlign: 'center',
      color: theme.colors.onBackground,
    },
    subtitle: {
      fontSize: 16,
      textAlign: 'center',
      marginBottom: 10,
      color: theme.colors.onBackground,
    },
    input: {
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    keyboardSpacer: {
      position: 'absolute',
      bottom: 0,
      width: '100%',
      backgroundColor: theme.colors.background,
    },
  }),
);

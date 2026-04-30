import { zodResolver } from '@hookform/resolvers/zod';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { Keyboard, Platform, StyleSheet, type TextStyle, View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';

import { useDialog } from '@/components/common/dialogContext';
import { useAuth } from '@/context/auth';
import { updateUser } from '@/services/api/authentication';
import { type OnboardingFormValues, onboardingSchema } from '@/services/api/validation/userSchema';
import { useAppTheme } from '@/theme';

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function getKeyboardHeight() {
  return Platform.OS !== 'web' && Keyboard.metrics() ? Keyboard.metrics()?.height : 0;
}

function getOnboardingTextShadow(color: string): TextStyle {
  return Platform.OS === 'web'
    ? ({ textShadow: `0px 0px 10px ${color}` } as TextStyle)
    : {
        textShadowColor: color,
        textShadowOffset: { width: 0, height: 0 } as const,
        textShadowRadius: 10,
      };
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
  const textShadowStyle = getOnboardingTextShadow(theme.colors.background);
  const styles = createStyles(theme);

  return (
    <View style={[styles.body, { bottom: getKeyboardHeight() }]}>
      <LinearGradient colors={['transparent', theme.colors.background]} style={styles.gradient} />
      <Text style={[styles.title, textShadowStyle]}>Welcome!</Text>
      <Text style={[styles.subtitle, textShadowStyle]}>Choose a username to continue.</Text>
      <Controller
        control={control}
        name="username"
        render={({ field: { onChange, value } }) => (
          <TextInput
            mode="outlined"
            value={value}
            onChangeText={onChange}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="e.g. awesome_user"
            onSubmitEditing={submitUsername}
          />
        )}
      />
      <Button
        mode="contained"
        loading={isSubmitting}
        disabled={isSubmitting || !isValid}
        style={styles.button}
        onPress={submitUsername}
      >
        Continue
      </Button>
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
        title: 'Error',
        message: getErrorMessage(error, 'Unable to save username. It might be taken.'),
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

function createStyles(theme: ReturnType<typeof useAppTheme>) {
  return StyleSheet.create({
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
    button: {
      width: '100%',
      padding: 5,
    },
    keyboardSpacer: {
      position: 'absolute',
      bottom: 0,
      width: '100%',
      backgroundColor: theme.colors.background,
    },
  });
}

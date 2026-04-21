import { zodResolver } from '@hookform/resolvers/zod';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { Keyboard, Platform, View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';

import { useDialog } from '@/components/common/dialogContext';
import { useAuth } from '@/context/auth';
import { useEffectiveColorScheme } from '@/context/themeMode';
import { updateUser } from '@/services/api/authentication';
import { type OnboardingFormValues, onboardingSchema } from '@/services/api/validation/userSchema';

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function getKeyboardHeight() {
  return Platform.OS !== 'web' && Keyboard.metrics() ? Keyboard.metrics()?.height : 0;
}

function getOnboardingTextShadow(colorScheme: 'light' | 'dark') {
  return {
    textShadowColor: colorScheme === 'light' ? 'white' : 'black',
    textShadowOffset: { width: 0, height: 0 } as const,
    textShadowRadius: 10,
  };
}

function OnboardingBody({
  colorScheme,
  control,
  submitUsername,
  isSubmitting,
  isValid,
}: {
  colorScheme: 'light' | 'dark';
  control: ReturnType<typeof useForm<OnboardingFormValues>>['control'];
  submitUsername: () => void;
  isSubmitting: boolean;
  isValid: boolean;
}) {
  const textShadowStyle = getOnboardingTextShadow(colorScheme);

  return (
    <View
      style={{
        padding: 20,
        gap: 15,
        position: 'absolute',
        bottom: getKeyboardHeight(),
        width: '100%',
      }}
    >
      <LinearGradient
        colors={['transparent', colorScheme === 'light' ? 'white' : 'black']}
        style={{
          position: 'absolute',
          top: -50,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      />
      <Text
        style={{
          fontSize: 32,
          fontWeight: 'bold',
          textAlign: 'center',
          ...textShadowStyle,
        }}
      >
        Welcome!
      </Text>
      <Text
        style={{
          fontSize: 16,
          textAlign: 'center',
          marginBottom: 10,
          ...textShadowStyle,
        }}
      >
        Choose a username to continue.
      </Text>
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
        style={{ width: '100%', padding: 5 }}
        onPress={submitUsername}
      >
        Continue
      </Button>
    </View>
  );
}

function OnboardingKeyboardSpacer({ colorScheme }: { colorScheme: 'light' | 'dark' }) {
  return (
    <View
      style={{
        position: 'absolute',
        bottom: 0,
        height: getKeyboardHeight(),
        width: '100%',
        backgroundColor: colorScheme === 'light' ? 'white' : 'black',
      }}
    />
  );
}

export default function Onboarding() {
  const router = useRouter();
  const dialog = useDialog();
  const { refetch } = useAuth();
  const colorScheme = useEffectiveColorScheme();

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
    <View style={{ flex: 1 }}>
      <OnboardingBody
        colorScheme={colorScheme}
        control={control}
        submitUsername={submitUsername}
        isSubmitting={isSubmitting}
        isValid={isValid}
      />
      <OnboardingKeyboardSpacer colorScheme={colorScheme} />
    </View>
  );
}

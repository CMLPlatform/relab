import { useCallback } from 'react';
import { Controller, type useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { AuthScreen } from '@/components/auth/AuthScreen';
import { LoginBrandHero, LoginCard } from '@/components/auth/LoginSections';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { TextInput } from '@/components/base/TextInput';
import { useOnboardingScreen } from '@/features/auth/useOnboardingScreen';
import type { OnboardingFormValues } from '@/services/api/validation/userSchema';

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
  const renderUsername = useCallback(
    ({
      field: { onChange, value },
    }: {
      field: { onChange: (text: string) => void; value: string };
    }) => (
      <View className="gap-1">
        <AppText variant="label">Username</AppText>
        <TextInput
          value={value}
          onChangeText={onChange}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="e.g. awesome_user"
          accessibilityLabel="Username"
          onSubmitEditing={submitUsername}
        />
      </View>
    ),
    [submitUsername],
  );

  return (
    // Sizing and centering come from AuthScreen; this only sets inner rhythm.
    <View className="gap-3">
      <LoginBrandHero />
      {/* The hero scrim is deliberately light — the card is what carries control
          legibility over the photo backdrop, so the copy and field live on it. */}
      <LoginCard>
        <AppText className="font-bold text-center text-foreground" style={styles.title}>
          Welcome!
        </AppText>
        <AppText className="text-center mb-2.5 text-foreground" style={styles.subtitle}>
          Choose a username to continue.
        </AppText>
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
      </LoginCard>
    </View>
  );
}

export default function Onboarding() {
  const { control, submitUsername, isValid, isSubmitting } = useOnboardingScreen();

  return (
    <AuthScreen>
      <OnboardingBody
        control={control}
        submitUsername={submitUsername}
        isSubmitting={isSubmitting}
        isValid={isValid}
      />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 32,
  },
  subtitle: {
    fontSize: 16,
  },
});

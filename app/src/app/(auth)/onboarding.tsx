import type { useForm } from 'react-hook-form';
import { View } from 'react-native';

import { AuthScreen } from '@/components/auth/AuthScreen';
import { LoginBrandHero, LoginCard } from '@/components/auth/LoginSections';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { ControlledTextField } from '@/components/base/ControlledTextField';
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
  return (
    // Sizing and centering come from AuthScreen; this only sets inner rhythm.
    <View className="gap-3">
      <LoginBrandHero />
      {/* The hero scrim is deliberately light — the card is what carries control
          legibility over the photo backdrop, so the copy and field live on it. */}
      <LoginCard>
        <AppText variant="title" className="font-bold text-center text-foreground">
          Welcome!
        </AppText>
        <AppText variant="body" className="text-center mb-2.5 text-foreground">
          Choose a username to continue.
        </AppText>
        <ControlledTextField
          control={control}
          name="username"
          label="Username"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="e.g. awesome_user"
          accessibilityLabel="Username"
          onSubmitEditing={submitUsername}
        />
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

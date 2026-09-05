import { type ComponentProps, type ReactNode, useCallback } from 'react';
import type { Control, ControllerRenderProps, FieldErrors } from 'react-hook-form';
import { Controller } from 'react-hook-form';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { BrandWordmark } from '@/components/base/BrandWordmark';
import { FormFieldError } from '@/components/base/FormField';
import { Icon } from '@/components/base/Icon';
import { TextInput } from '@/components/base/TextInput';
import { WEBSITE_URL } from '@/config';
import {
  type NewAccountFormValues,
  PASSWORD_MIN_LENGTH,
} from '@/services/api/validation/userSchema';
import { openExternalUrl } from '@/services/externalLinks';
import { useAppTheme } from '@/theme';
import { describedBy } from '@/utils/a11y';

// Every row is a fixed slot, so the three steps are identical and nothing moves
// as the error message comes and goes. The slots stay fixed-height even under
// OS font scaling; MAX_FONT_SCALE caps the label text so it stays legible
// instead of clipping against the slot at large accessibility sizes. (The
// helper/error text renders via the shared FormFieldError component, which
// carries the same cap itself.)
const LABEL_ROW_HEIGHT = 16;
const MAX_FONT_SCALE = 1.5;
const INPUT_ROW_HEIGHT = 48;
const HELPER_SLOT_HEIGHT = 18;
const ACTION_ROW_HEIGHT = 44;
const CARD_PADDING = 16;
const CARD_GAP = 6;
const CARD_HEIGHT =
  CARD_PADDING * 2 +
  LABEL_ROW_HEIGHT +
  INPUT_ROW_HEIGHT +
  HELPER_SLOT_HEIGHT +
  ACTION_ROW_HEIGHT +
  CARD_GAP * 3;
// Shared by the step card and the footer card so the two line up.
const CARD_MAX_WIDTH = 380;

const styles = StyleSheet.create({
  step: {
    maxWidth: CARD_MAX_WIDTH,
  },
  // NOTE: welcomeText/brandText/questionText are a bespoke three-line
  // headline stack (own line, own weight per line), plain RN Text predating
  // AppText — no single ramp step covers three different custom sizes in
  // one headline.
  welcomeText: {
    fontSize: 40,
  },
  // 64, not 80: it has to fit the card's measure now, and a username is
  // arbitrary text — the slot is a fixed height, so it truncates rather than
  // wrapping out of it.
  brandText: {
    fontSize: 64,
  },
  // Logo standing in for the "Relab" wordmark on the first step; sized to
  // carry the same visual weight as the brandText it replaces.
  brandLogo: {
    width: 200,
  },
  questionText: {
    fontSize: 31,
  },
  // maxWidth: the control block is a compact instrument under a wide headline —
  // a username field has no business being 390px. Fixed height so all three
  // steps are the same size and nothing moves when the error slot fills.
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    height: CARD_HEIGHT,
    padding: CARD_PADDING,
    gap: CARD_GAP,
  },
  // A visible label that survives typing — the placeholder used to be the only
  // name for the field, and it disappears the moment you type into it.
  // NOTE: fontSize 12 is sized to LABEL_ROW_HEIGHT (16) as part of the
  // hand-computed CARD_HEIGHT; swapping to a ramp step's own line height
  // would desync the fixed-height card math above.
  label: {
    height: LABEL_ROW_HEIGHT,
    fontSize: 12,
  },
  inputRow: {
    height: INPUT_ROW_HEIGHT,
  },
  helperSlot: {
    height: HELPER_SLOT_HEIGHT,
  },
  // NOTE: see label above — locked to HELPER_SLOT_HEIGHT (18), not a ramp step.
  helperText: {
    fontSize: 12,
  },
  // Back left, primary right — the wizard convention. The primary action gets
  // its own row so "Create account" stops overflowing the card's padding.
  actionRow: {
    height: ACTION_ROW_HEIGHT,
  },
  // NOTE: sized to sit visually with the 16px chevron beside it, not a ramp step.
  backButtonText: {
    fontSize: 13,
  },
  scroll: {
    paddingBottom: 120,
  },
  footerCard: {
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: CARD_MAX_WIDTH,
  },
  // NOTE: matches label/helperText's 12px so all of this wizard's small print
  // reads as one consistent size, rather than mixing in the 13px caption step.
  privacyText: {
    fontSize: 12,
  },
  privacyLink: {
    fontSize: 12,
  },
});

type SharedStepProps = {
  control: Control<NewAccountFormValues>;
  errors: FieldErrors<NewAccountFormValues>;
  headlineColor: string;
  mutedColor: string;
};

// No checkbox: creating the account is the acceptance, recorded server-side as
// terms_accepted_version / terms_accepted_at.
export function PrivacyPolicy() {
  const theme = useAppTheme();
  const termsUrl = WEBSITE_URL ? new URL('/terms', WEBSITE_URL).toString() : '';
  const privacyUrl = WEBSITE_URL ? new URL('/privacy', WEBSITE_URL).toString() : '';
  const textColor = theme.colors.onBackground;
  const openTerms = useCallback(() => {
    if (termsUrl) {
      void openExternalUrl(termsUrl);
    }
  }, [termsUrl]);
  const openPrivacy = useCallback(() => {
    if (privacyUrl) {
      void openExternalUrl(privacyUrl);
    }
  }, [privacyUrl]);

  return (
    <Text
      className="text-center"
      style={[styles.privacyText, { color: theme.colors.onSurfaceVariant }]}
    >
      By creating an account, you agree to our{' '}
      <Text
        className="underline"
        style={[styles.privacyLink, { color: textColor }]}
        onPress={openTerms}
        accessibilityRole="link"
      >
        Terms
      </Text>{' '}
      and{' '}
      <Text
        className="underline"
        style={[styles.privacyLink, { color: textColor }]}
        onPress={openPrivacy}
        accessibilityRole="link"
      >
        Privacy Policy
      </Text>
    </Text>
  );
}

type StepFieldName = 'username' | 'email' | 'password';

function NewAccountStep({
  control,
  errors,
  headlineColor,
  mutedColor,
  field,
  lines,
  label,
  brandLogo,
  inputProps,
  next,
  submit,
  back,
}: SharedStepProps & {
  field: StepFieldName;
  lines: [string, string, string];
  label: string;
  brandLogo?: boolean;
  inputProps: ComponentProps<typeof TextInput>;
  next?: { testID: string; accessibilityLabel: string; onPress: () => void };
  submit?: { isSubmitting: boolean; onPress: () => void };
  back?: { label: string; accessibilityLabel: string; onPress: () => void };
}) {
  const theme = useAppTheme();
  const error = errors[field];
  const errorId = `${field}-error`;
  const renderInput = useCallback(
    ({ field: { onChange, value } }: { field: ControllerRenderProps<NewAccountFormValues> }) => (
      <TextInput
        value={value}
        onChangeText={onChange}
        autoCapitalize="none"
        accessibilityLabel={label}
        {...inputProps}
        {...describedBy(errorId, Boolean(error))}
        className="flex-1 border px-3 py-2.5"
        style={{
          borderColor: error ? theme.tokens.status.danger : theme.colors.outline,
          backgroundColor: error ? theme.colors.errorContainer : undefined,
        }}
      />
    ),
    [error, errorId, inputProps, label, theme],
  );

  return (
    // One column for the headline and the card, so the copy starts exactly at
    // the card's left edge instead of floating out to the wider measure.
    <View className="w-full self-center" style={styles.step}>
      <Text className="mt-20" style={[styles.welcomeText, { color: headlineColor }]}>
        {lines[0]}
      </Text>
      {/* Fixed height: the mark and the 80px name measure differently, and without
          this the card sat 22px lower on step one than on the rest. */}
      <View className="h-24 justify-center">
        {brandLogo ? (
          <BrandWordmark style={styles.brandLogo} />
        ) : (
          <Text
            className="font-bold"
            style={[styles.brandText, { color: headlineColor }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {lines[1]}
          </Text>
        )}
      </View>
      <Text className="mt-20 mb-10" style={[styles.questionText, { color: headlineColor }]}>
        {lines[2]}
      </Text>
      <View
        className="rounded-lg w-full justify-center"
        style={[
          styles.card,
          {
            backgroundColor: theme.tokens.surface.card,
            borderColor: theme.tokens.border.subtle,
          },
        ]}
      >
        <Text style={[styles.label, { color: mutedColor }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {label}
        </Text>
        <View className="flex-row items-center" style={styles.inputRow}>
          <Controller control={control} name={field} render={renderInput} />
        </View>
        {/* Reserved, never conditional: the message fills this slot instead of growing
            the card. The error still stays until the field is actually fixed — it is
            not on a timer — it just no longer moves the layout when it appears. */}
        <View className="justify-center" style={styles.helperSlot}>
          <FormFieldError errorId={errorId} message={error?.message} style={styles.helperText} />
        </View>
        <View className="flex-row items-center justify-between" style={styles.actionRow}>
          {/* Holds the left half of the action row even on step one, which has no back
              action — otherwise the primary button would slide across between steps. */}
          <View className="flex-1 justify-center">
            {back ? (
              <Pressable
                className="flex-row items-center self-start"
                onPress={back.onPress}
                accessibilityRole="button"
                accessibilityLabel={back.accessibilityLabel}
                hitSlop={12}
              >
                <Icon name="chevron-left" size={16} color={mutedColor} />
                <Text className="ml-1" style={[styles.backButtonText, { color: mutedColor }]}>
                  {back.label}
                </Text>
              </Pressable>
            ) : null}
          </View>
          {next ? (
            <AppButton
              variant="primary"
              testID={next.testID}
              accessibilityLabel={next.accessibilityLabel}
              disabled={Boolean(error)}
              onPress={next.onPress}
            >
              Continue
            </AppButton>
          ) : null}
          {submit ? (
            <AppButton variant="primary" onPress={submit.onPress} loading={submit.isSubmitting}>
              Create account
            </AppButton>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export function NewAccountUsernameStep({
  onAdvance,
  ...shared
}: SharedStepProps & { onAdvance: () => void }) {
  return (
    <NewAccountStep
      {...shared}
      field="username"
      lines={['Welcome to', 'Relab', 'Who are you?']}
      label="Username"
      brandLogo
      inputProps={{
        autoCorrect: false,
        autoComplete: 'username-new',
        textContentType: 'username',
        placeholder: 'e.g. awesome_user',
        returnKeyType: 'next',
        onSubmitEditing: onAdvance,
      }}
      next={{
        testID: 'username-next',
        accessibilityLabel: 'Continue to email',
        onPress: onAdvance,
      }}
    />
  );
}

export function NewAccountEmailStep({
  username,
  onAdvance,
  onBack,
  ...shared
}: SharedStepProps & {
  username: string;
  onAdvance: () => void;
  onBack: () => void;
}) {
  return (
    <NewAccountStep
      {...shared}
      field="email"
      lines={['Hi', username, 'How do we reach you?']}
      label="Email address"
      inputProps={{
        autoCorrect: false,
        autoComplete: 'email',
        textContentType: 'emailAddress',
        keyboardType: 'email-address',
        placeholder: 'e.g. you@university.edu',
        returnKeyType: 'next',
        onSubmitEditing: onAdvance,
      }}
      next={{
        testID: 'email-next',
        accessibilityLabel: 'Continue to password',
        onPress: onAdvance,
      }}
      back={{
        label: 'Edit username',
        accessibilityLabel: 'Go back to edit username',
        onPress: onBack,
      }}
    />
  );
}

export function NewAccountPasswordStep({
  username,
  isSubmitting,
  onSubmit,
  onBack,
  ...shared
}: SharedStepProps & {
  username: string;
  isSubmitting: boolean;
  onSubmit: () => void;
  onBack: () => void;
}) {
  return (
    <NewAccountStep
      {...shared}
      field="password"
      lines={['Finally,', username, 'How will you sign in?']}
      label="Password"
      inputProps={{
        autoComplete: 'password-new',
        textContentType: 'newPassword',
        secureTextEntry: true,
        // An example/hint, not a second label — and sourced from the schema's
        // own constant so it cannot drift from the rule it describes.
        placeholder: `At least ${PASSWORD_MIN_LENGTH} characters`,
        returnKeyType: 'done',
        onSubmitEditing: onSubmit,
      }}
      submit={{ isSubmitting, onPress: onSubmit }}
      back={{
        label: 'Edit email address',
        accessibilityLabel: 'Go back to edit email address',
        onPress: onBack,
      }}
    />
  );
}

type NewAccountLayoutProps = {
  children: ReactNode;
  onNavigateToLogin: () => void;
};

export function NewAccountLayout({ children, onNavigateToLogin }: NewAccountLayoutProps) {
  const theme = useAppTheme();
  return (
    <View className="flex-1">
      <ScrollView
        contentContainerClassName="flex-grow p-5 items-center"
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* An intrinsic cap rather than a breakpoint: the column fills narrow screens
            and stops growing past a readable measure, so there's no width at which the
            layout jumps. */}
        <View className="w-full max-w-[480px]">{children}</View>
      </ScrollView>

      {/* On a card, not bare over the photo: the hero scrim is light by design
          and the backdrop's densest area sits right behind this footer. */}
      <View className="absolute bottom-5 left-5 right-5 items-center">
        <View
          className="rounded-lg py-2 px-4 items-center gap-1 w-full"
          style={[
            styles.footerCard,
            {
              backgroundColor: theme.tokens.surface.card,
              borderColor: theme.tokens.border.subtle,
            },
          ]}
        >
          <PrivacyPolicy />
          <AppButton variant="ghost" onPress={onNavigateToLogin}>
            I already have an account
          </AppButton>
        </View>
      </View>
    </View>
  );
}

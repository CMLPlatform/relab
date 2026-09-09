import { type ComponentProps, type ReactNode, useCallback } from 'react';
import type { Control, ControllerRenderProps, FieldErrors } from 'react-hook-form';
import { Controller } from 'react-hook-form';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
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
import { getStatusTone, useAppTheme } from '@/theme';
import { describedBy } from '@/utils/a11y';

// Fixed-height slots so nothing moves as the error message comes and goes.
// MAX_FONT_SCALE keeps the label from clipping against the slot.
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
  // welcomeText/brandText/questionText are a bespoke three-line headline
  // stack; no single ramp step covers three custom sizes.
  welcomeText: {
    // NOTE: hero stack line 1, between display (38) and the 64px name.
    fontSize: 40,
  },
  // Fits the card's measure; the fixed-height slot truncates a long username.
  brandText: {
    // NOTE: hero stack line 2; the ramp tops out at display (38).
    fontSize: 64,
  },
  // Logo in place of the wordmark on the first step; sized to match brandText.
  brandLogo: {
    width: 200,
  },
  questionText: {
    // NOTE: hero stack line 3, between title (24) and display (38).
    fontSize: 31,
  },
  // Fixed height so all three steps are the same size.
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    height: CARD_HEIGHT,
    padding: CARD_PADDING,
    gap: CARD_GAP,
  },
  label: {
    height: LABEL_ROW_HEIGHT,
    // NOTE: sized to LABEL_ROW_HEIGHT (16) in the CARD_HEIGHT math; caption's 18px line does not fit.
    fontSize: 12,
  },
  inputRow: {
    height: INPUT_ROW_HEIGHT,
  },
  helperSlot: {
    height: HELPER_SLOT_HEIGHT,
  },
  // The primary action gets its own row so "Create account" does not overflow.
  actionRow: {
    height: ACTION_ROW_HEIGHT,
  },
  scroll: {
    paddingBottom: 120,
  },
  footerCard: {
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: CARD_MAX_WIDTH,
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
    <AppText variant="caption" className="text-center text-muted-foreground">
      By creating an account, you agree to our{' '}
      <AppText
        variant="caption"
        className="underline"
        style={{ color: textColor }}
        onPress={openTerms}
        accessibilityRole="link"
      >
        Terms
      </AppText>{' '}
      and{' '}
      <AppText
        variant="caption"
        className="underline"
        style={{ color: textColor }}
        onPress={openPrivacy}
        accessibilityRole="link"
      >
        Privacy Policy
      </AppText>
    </AppText>
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
          // Danger tint, same as Chip's error state.
          backgroundColor: error ? getStatusTone(theme.tokens.status.danger) : undefined,
        }}
      />
    ),
    [error, errorId, inputProps, label, theme],
  );

  return (
    // One column so the headline starts at the card's left edge.
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
            the card. The error still stays until the field is actually fixed; it is
            not on a timer. It just no longer moves the layout when it appears. */}
        <View className="justify-center" style={styles.helperSlot}>
          <FormFieldError errorId={errorId} message={error?.message} />
        </View>
        <View className="flex-row items-center justify-between" style={styles.actionRow}>
          {/* Holds the left half of the action row even on step one, which has no back
              action; otherwise the primary button would slide across between steps. */}
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
                <AppText variant="caption" className="ml-1" style={{ color: mutedColor }}>
                  {back.label}
                </AppText>
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
        autoComplete: 'username',
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
        // Sourced from the schema's constant so it cannot drift.
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

import { type ComponentProps, type ReactNode, useCallback } from 'react';
import type { Control, ControllerRenderProps, FieldErrors } from 'react-hook-form';
import { Controller } from 'react-hook-form';
import {
  Pressable,
  type PressableStateCallbackType,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { BrandWordmark } from '@/components/base/BrandWordmark';
import { Icon } from '@/components/base/Icon';
import { TextInput } from '@/components/base/TextInput';
import { WEBSITE_URL } from '@/config';
import { radius } from '@/constants';
import {
  type NewAccountFormValues,
  PASSWORD_MIN_LENGTH,
} from '@/services/api/validation/userSchema';
import { openExternalUrl } from '@/services/externalLinks';
import { useAppTheme } from '@/theme';

// Every row is a fixed slot, so the three steps are identical and nothing moves
// as the error message comes and goes.
const LABEL_ROW_HEIGHT = 16;
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
// The mark and the 80px name are different heights; pinning the slot keeps the
// card from jumping between step one and the rest.
const BRAND_SLOT_HEIGHT = 96;

const styles = StyleSheet.create({
  welcomeText: {
    marginTop: 80,
    fontSize: 40,
    marginLeft: 5,
  },
  // Fixed height: the mark and the 80px name measure differently, and without
  // this the card sat 22px lower on step one than on the rest.
  brandSlot: {
    height: BRAND_SLOT_HEIGHT,
    justifyContent: 'center',
  },
  brandText: {
    fontSize: 80,
    fontWeight: 'bold',
  },
  // Logo standing in for the "Relab" wordmark on the first step; sized to
  // carry the same visual weight as the 80px brandText it replaces.
  brandLogo: {
    width: 200,
    marginLeft: 5,
  },
  questionText: {
    fontSize: 31,
    marginTop: 80,
    marginLeft: 5,
    marginBottom: 40,
  },
  // maxWidth: the control block is a compact instrument under a wide headline —
  // a username field has no business being 390px. Fixed height so all three
  // steps are the same size and nothing moves when the error slot fills.
  card: {
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: CARD_PADDING,
    maxWidth: 380,
    alignSelf: 'flex-start',
    width: '100%',
    height: CARD_HEIGHT,
    justifyContent: 'center',
    gap: CARD_GAP,
  },
  // A visible label that survives typing — the placeholder used to be the only
  // name for the field, and it disappears the moment you type into it.
  label: {
    height: LABEL_ROW_HEIGHT,
    fontSize: 12,
    opacity: 0.7,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: INPUT_ROW_HEIGHT,
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  // Back left, primary right — the wizard convention. The primary action gets
  // its own row so "Create account" stops overflowing the card's padding.
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: ACTION_ROW_HEIGHT,
  },
  // Reserved, never conditional: the message fills this slot instead of growing
  // the card. The error still stays until the field is actually fixed — it is
  // not on a timer — it just no longer moves the layout when it appears.
  helperSlot: {
    height: HELPER_SLOT_HEIGHT,
    justifyContent: 'center',
  },
  helperText: {
    fontSize: 12,
  },
  // Holds the left half of the action row even on step one, which has no back
  // action — otherwise the primary button would slide across between steps.
  backSlot: {
    flex: 1,
    justifyContent: 'center',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  backButtonText: {
    fontSize: 13,
    marginLeft: 4,
  },
  scroll: {
    flexGrow: 1,
    padding: 20,
    paddingBottom: 120,
    alignItems: 'center',
  },
  // An intrinsic cap rather than a breakpoint: the column fills narrow screens
  // and stops growing past a readable measure, so there's no width at which the
  // layout jumps.
  column: {
    width: '100%',
    maxWidth: 480,
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  footerCard: {
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 4,
    width: '100%',
    maxWidth: 480,
  },
  privacyText: {
    fontSize: 12,
    opacity: 0.7,
    textAlign: 'center',
  },
  privacyLink: {
    fontSize: 12,
    textDecorationLine: 'underline',
  },
});

type SharedStepProps = {
  control: Control<NewAccountFormValues>;
  errors: FieldErrors<NewAccountFormValues>;
  headlineColor: string;
  mutedColor: string;
};

export function PrivacyPolicy() {
  const theme = useAppTheme();
  const url = WEBSITE_URL ? new URL('/privacy', WEBSITE_URL).toString() : '';
  const textColor = theme.colors.onBackground;
  const openPrivacy = useCallback(() => {
    if (url) {
      void openExternalUrl(url);
    }
  }, [url]);

  return (
    <Text style={[styles.privacyText, { color: textColor }]}>
      By creating an account, you agree to our{' '}
      <Text
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
  const renderInput = useCallback(
    ({ field: { onChange, value } }: { field: ControllerRenderProps<NewAccountFormValues> }) => (
      <TextInput
        value={value}
        onChangeText={onChange}
        autoCapitalize="none"
        accessibilityLabel={label}
        {...inputProps}
        style={[
          styles.textInput,
          {
            borderColor: error ? theme.tokens.status.danger : theme.colors.outline,
            backgroundColor: error ? theme.colors.errorContainer : undefined,
          },
        ]}
      />
    ),
    [error, inputProps, label, theme],
  );

  return (
    <View>
      <Text style={[styles.welcomeText, { color: headlineColor }]}>{lines[0]}</Text>
      <View style={styles.brandSlot}>
        {brandLogo ? (
          <BrandWordmark style={styles.brandLogo} />
        ) : (
          <Text style={[styles.brandText, { color: headlineColor }]}>{lines[1]}</Text>
        )}
      </View>
      <Text style={[styles.questionText, { color: headlineColor }]}>{lines[2]}</Text>
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.tokens.surface.card,
            borderColor: theme.tokens.border.subtle,
          },
        ]}
      >
        <Text style={[styles.label, { color: headlineColor }]}>{label}</Text>
        <View style={styles.inputRow}>
          <Controller control={control} name={field} render={renderInput} />
        </View>
        <View style={styles.helperSlot}>
          {error ? (
            <Text style={[styles.helperText, { color: theme.tokens.status.danger }]}>
              {error.message}
            </Text>
          ) : null}
        </View>
        <View style={styles.actionRow}>
          <View style={styles.backSlot}>
            {back ? (
              <Pressable
                style={styles.backButton}
                onPress={back.onPress}
                accessibilityRole="button"
                accessibilityLabel={back.accessibilityLabel}
                hitSlop={12}
              >
                <Icon name="chevron-left" size={16} color={mutedColor} />
                <Text style={[styles.backButtonText, { color: mutedColor }]}>{back.label}</Text>
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
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>{children}</View>
      </ScrollView>

      {/* On a card, not bare over the photo: the hero scrim is light by design
          and the backdrop's densest area sits right behind this footer. */}
      <View style={styles.bottomContainer}>
        <View
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

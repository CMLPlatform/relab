import { z } from 'zod';
// spell-checker: ignore blocklisted, changeme, letmein, reverseengineeringlab

// Canonical validation constraints used by the auth schemas and helper text.
export const USERNAME_MIN_LENGTH = 2;
export const USERNAME_MAX_LENGTH = 50;
export const USERNAME_PATTERN = /^\w+$/; // Only letters, numbers, and underscores

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
const MIN_CONTEXT_TOKEN_LENGTH = 3;
const BLOCKLISTED_PASSWORD_TOKENS = new Set([
  'password',
  'qwerty',
  'admin',
  'letmein',
  'welcome',
  'changeme',
  'relab',
  'reverseengineeringlab',
]);

function normalizeForPasswordValidation(value: string): string {
  return value.normalize('NFC').toLocaleLowerCase();
}

function passwordContainsContext(normalizedPassword: string, value: string | undefined): boolean {
  if (!value) return false;
  const normalizedValue = normalizeForPasswordValidation(value);
  return (
    normalizedValue.length >= MIN_CONTEXT_TOKEN_LENGTH &&
    normalizedPassword.includes(normalizedValue)
  );
}

function passwordMatchesBlocklist(normalizedPassword: string): boolean {
  const compactPassword = normalizedPassword.replaceAll(/[^a-z0-9]/g, '');
  return [...BLOCKLISTED_PASSWORD_TOKENS].some((blocked) => compactPassword.includes(blocked));
}

// ─── Individual field schemas ───────────────────────────────────────────────

export const usernameSchema = z
  .string({ message: 'Username is required' })
  .min(1, 'Username is required')
  .transform((val) => val.trim())
  .refine((val) => val.length > 0, 'Username is required')
  .refine(
    (val) => val.length >= USERNAME_MIN_LENGTH,
    `Username must be at least ${USERNAME_MIN_LENGTH} characters`,
  )
  .refine(
    (val) => val.length <= USERNAME_MAX_LENGTH,
    `Username must be at most ${USERNAME_MAX_LENGTH} characters`,
  )
  .refine(
    (val) => USERNAME_PATTERN.test(val),
    'Username can only contain letters, numbers, and underscores',
  );

export const emailSchema = z
  .string({ message: 'Email is required' })
  .min(1, 'Email is required')
  .transform((val) => val.trim())
  .refine((val) => val.length > 0, 'Email is required')
  .refine((val) => z.string().email().safeParse(val).success, 'Please enter a valid email address');

export const passwordSchema = z
  .string({ message: 'Password is required' })
  .min(1, 'Password is required')
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`)
  .refine(
    (password) => !passwordMatchesBlocklist(normalizeForPasswordValidation(password)),
    'Password is too common. Choose a longer, less predictable password.',
  );

// ─── Form schemas ──────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().min(1, 'Email is required'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

export const onboardingSchema = z.object({
  username: usernameSchema,
});

export type OnboardingFormValues = z.infer<typeof onboardingSchema>;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  password: passwordSchema,
});

export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

export const newAccountSchema = z
  .object({
    username: usernameSchema,
    email: emailSchema,
    password: passwordSchema,
  })
  .superRefine((data, ctx) => {
    const normalizedPassword = normalizeForPasswordValidation(data.password);
    const normalizedEmail = normalizeForPasswordValidation(data.email);
    const emailUsername = normalizedEmail.split('@')[0];

    if (passwordContainsContext(normalizedPassword, data.username)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['password'],
        message: 'Password cannot contain your username',
      });
    }

    if (
      normalizedPassword.includes(normalizedEmail) ||
      passwordContainsContext(normalizedPassword, emailUsername)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['password'],
        message: 'Password cannot contain your email address',
      });
    }
  });

export type NewAccountFormValues = z.infer<typeof newAccountSchema>;

// ─── Helper text functions ─────────────────────────────────────────────────

export function getUsernameHelperText(): string {
  return `Username must be ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} characters and contain only letters, numbers, and underscores`;
}

export function getEmailHelperText(): string {
  return 'Enter a valid email address';
}

export function getPasswordHelperText(): string {
  return `Password must be ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters and cannot contain your username or email`;
}

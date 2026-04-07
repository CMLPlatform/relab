import { z } from 'zod';

// Re-export constants from user.ts for backward compatibility and single source of truth
export const USERNAME_MIN_LENGTH = 2;
export const USERNAME_MAX_LENGTH = 50;
export const USERNAME_PATTERN = /^\w+$/; // Only letters, numbers, and underscores

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

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
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`);

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
    // Check if password contains username
    if (data.password.toLowerCase().includes(data.username.toLowerCase())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['password'],
        message: 'Password cannot contain your username',
      });
    }

    // Check if password contains email or email username part
    const emailUsername = data.email.split('@')[0];
    if (
      data.password.toLowerCase().includes(data.email.toLowerCase()) ||
      data.password.toLowerCase().includes(emailUsername.toLowerCase())
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

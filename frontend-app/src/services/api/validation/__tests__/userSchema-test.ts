import { describe, expect, it } from '@jest/globals';
import {
  emailSchema,
  newAccountSchema,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordSchema,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  usernameSchema,
} from '../userSchema';

// Helper to extract all error messages from a Zod result
function getErrorMessages(result: unknown): string[] {
  if (
    !result ||
    typeof result !== 'object' ||
    !('success' in result) ||
    result.success ||
    !('error' in result) ||
    !result.error ||
    typeof result.error !== 'object' ||
    !('flatten' in result.error) ||
    typeof result.error.flatten !== 'function'
  ) {
    return [];
  }

  const flattened = result.error.flatten() as {
    formErrors?: unknown;
    fieldErrors?: unknown;
  };
  const messages: string[] = Array.isArray(flattened.formErrors) ? [...flattened.formErrors] : [];

  if (Array.isArray(flattened.fieldErrors)) {
    messages.push(
      ...flattened.fieldErrors.filter((message): message is string => typeof message === 'string'),
    );
  } else if (flattened.fieldErrors && typeof flattened.fieldErrors === 'object') {
    for (const fieldErrors of Object.values(flattened.fieldErrors)) {
      if (Array.isArray(fieldErrors)) {
        messages.push(
          ...fieldErrors.filter((message): message is string => typeof message === 'string'),
        );
      }
    }
  }
  return messages;
}

// ─── usernameSchema tests ──────────────────────────────────────────────────

describe('usernameSchema', () => {
  it('returns invalid for username shorter than minimum length', () => {
    const result = usernameSchema.safeParse('a');
    expect(result.success).toBe(false);
    const messages = getErrorMessages(result);
    expect(messages.some((m) => m.includes(`at least ${USERNAME_MIN_LENGTH}`))).toBe(true);
  });

  it('returns valid for username at minimum length', () => {
    const result = usernameSchema.safeParse('ab');
    expect(result.success).toBe(true);
  });

  it('returns invalid for username longer than maximum length', () => {
    const result = usernameSchema.safeParse('a'.repeat(USERNAME_MAX_LENGTH + 1));
    expect(result.success).toBe(false);
    const messages = getErrorMessages(result);
    expect(messages.some((m) => m.includes(`at most ${USERNAME_MAX_LENGTH}`))).toBe(true);
  });

  it('returns valid for username at maximum length', () => {
    const result = usernameSchema.safeParse('a'.repeat(USERNAME_MAX_LENGTH));
    expect(result.success).toBe(true);
  });

  it('returns invalid for username with spaces', () => {
    const result = usernameSchema.safeParse('user name');
    expect(result.success).toBe(false);
    const messages = getErrorMessages(result);
    expect(messages.some((m) => m.includes('letters, numbers, and underscores'))).toBe(true);
  });

  it('returns invalid for username with special characters', () => {
    const result = usernameSchema.safeParse('user@name');
    expect(result.success).toBe(false);
  });

  it('returns valid for username with letters, numbers, and underscores', () => {
    const result = usernameSchema.safeParse('valid_user123');
    expect(result.success).toBe(true);
  });
});

// ─── emailSchema tests ──────────────────────────────────────────────────────

describe('emailSchema', () => {
  it('returns invalid for empty string with custom message', () => {
    const result = emailSchema.safeParse('');
    expect(result.success).toBe(false);
    const messages = getErrorMessages(result);
    expect(messages.some((m) => m.includes('Email is required'))).toBe(true);
  });

  it('returns valid for a properly formatted email', () => {
    const result = emailSchema.safeParse('user@example.com');
    expect(result.success).toBe(true);
  });
});

// ─── passwordSchema tests ───────────────────────────────────────────────────

describe('passwordSchema', () => {
  it('returns invalid for empty string', () => {
    const result = passwordSchema.safeParse('');
    expect(result.success).toBe(false);
    const messages = getErrorMessages(result);
    expect(messages.some((m) => m.includes('Password is required'))).toBe(true);
  });

  it('returns invalid for password shorter than minimum length', () => {
    const result = passwordSchema.safeParse('a'.repeat(PASSWORD_MIN_LENGTH - 1));
    expect(result.success).toBe(false);
    const messages = getErrorMessages(result);
    expect(messages.some((m) => m.includes(`at least ${PASSWORD_MIN_LENGTH}`))).toBe(true);
  });

  it('returns valid for password at minimum length', () => {
    const result = passwordSchema.safeParse('a'.repeat(PASSWORD_MIN_LENGTH));
    expect(result.success).toBe(true);
  });

  it('returns invalid for password longer than maximum length', () => {
    const result = passwordSchema.safeParse('a'.repeat(PASSWORD_MAX_LENGTH + 1));
    expect(result.success).toBe(false);
    const messages = getErrorMessages(result);
    expect(messages.some((m) => m.includes(`at most ${PASSWORD_MAX_LENGTH}`))).toBe(true);
  });

  it('returns valid with a normal password', () => {
    const result = passwordSchema.safeParse('StrongPassword123');
    expect(result.success).toBe(true);
  });
});

// ─── newAccountSchema tests (cross-field validation) ──────────────────────

describe('newAccountSchema', () => {
  it('returns invalid when password contains the username', () => {
    const result = newAccountSchema.safeParse({
      username: 'user123',
      email: 'user@example.com',
      password: 'mypassworduser123',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flattened = result.error.flatten();
      const passwordErrors = flattened.fieldErrors.password || [];
      expect(passwordErrors.some((m) => m.includes('username'))).toBe(true);
    }
  });

  it('is case-insensitive when checking username in password', () => {
    const result = newAccountSchema.safeParse({
      username: 'user123',
      email: 'user@example.com',
      password: 'mypasswordUSER123',
    });
    expect(result.success).toBe(false);
  });

  it('returns invalid when password contains the email address', () => {
    const result = newAccountSchema.safeParse({
      username: 'validuser',
      email: 'user@example.com',
      password: 'mypassworduser@example.com',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flattened = result.error.flatten();
      const passwordErrors = flattened.fieldErrors.password || [];
      expect(passwordErrors.some((m) => m.includes('email'))).toBe(true);
    }
  });

  it('returns invalid when password contains the email local part', () => {
    const result = newAccountSchema.safeParse({
      username: 'validuser',
      email: 'user_part@example.com',
      password: 'password_with_user_part',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flattened = result.error.flatten();
      const passwordErrors = flattened.fieldErrors.password || [];
      expect(passwordErrors.some((m) => m.includes('email'))).toBe(true);
    }
  });

  it('returns valid for a complete, correct account data', () => {
    const result = newAccountSchema.safeParse({
      username: 'validuser',
      email: 'user@example.com',
      password: 'StrongPassword123',
    });
    expect(result.success).toBe(true);
  });

  it('returns invalid when username is too short', () => {
    const result = newAccountSchema.safeParse({
      username: 'a',
      email: 'user@example.com',
      password: 'StrongPassword123',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flattened = result.error.flatten();
      const usernameErrors = flattened.fieldErrors.username || [];
      expect(usernameErrors.some((m) => m.includes('at least'))).toBe(true);
    }
  });

  it('returns invalid when email is malformed', () => {
    const result = newAccountSchema.safeParse({
      username: 'validuser',
      email: 'not_an_email',
      password: 'StrongPassword123',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flattened = result.error.flatten();
      const emailErrors = flattened.fieldErrors.email || [];
      expect(emailErrors.some((m) => m.includes('valid email'))).toBe(true);
    }
  });

  it('returns invalid when password is too short', () => {
    const result = newAccountSchema.safeParse({
      username: 'validuser',
      email: 'user@example.com',
      password: 'short',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flattened = result.error.flatten();
      const passwordErrors = flattened.fieldErrors.password || [];
      expect(passwordErrors.some((m) => m.includes('at least'))).toBe(true);
    }
  });
});

import { describe, it, expect } from '@jest/globals';
import {
  validateUsername,
  validateEmail,
  validatePassword,
  getUsernameHelperText,
  getEmailHelperText,
  getPasswordHelperText,
  USERNAME_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from '../user';

describe('validateUsername', () => {
  it('returns invalid for undefined', () => {
    const result = validateUsername(undefined);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Username is required');
  });

  it('returns invalid for empty string', () => {
    const result = validateUsername('');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Username is required');
  });

  it('returns invalid for whitespace-only string', () => {
    const result = validateUsername('   ');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Username is required');
  });

  it('returns invalid for username shorter than minimum length', () => {
    const result = validateUsername('a');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain(`at least ${USERNAME_MIN_LENGTH}`);
  });

  it('returns valid for username at minimum length', () => {
    const result = validateUsername('ab');
    expect(result.isValid).toBe(true);
  });

  it('returns invalid for username longer than maximum length', () => {
    const result = validateUsername('a'.repeat(USERNAME_MAX_LENGTH + 1));
    expect(result.isValid).toBe(false);
    expect(result.error).toContain(`at most ${USERNAME_MAX_LENGTH}`);
  });

  it('returns valid for username at maximum length', () => {
    const result = validateUsername('a'.repeat(USERNAME_MAX_LENGTH));
    expect(result.isValid).toBe(true);
  });

  it('returns invalid for username with spaces', () => {
    const result = validateUsername('user name');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('letters, numbers, and underscores');
  });

  it('returns invalid for username with special characters', () => {
    const result = validateUsername('user@name');
    expect(result.isValid).toBe(false);
  });

  it('returns valid for username with letters, numbers, and underscores', () => {
    expect(validateUsername('valid_user123').isValid).toBe(true);
  });
});

describe('validateEmail', () => {
  it('returns invalid for undefined', () => {
    const result = validateEmail(undefined);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Email is required');
  });

  it('returns invalid for empty string', () => {
    const result = validateEmail('');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Email is required');
  });

  it('returns invalid for missing @', () => {
    const result = validateEmail('notanemail');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('valid email');
  });

  it('returns invalid for missing domain', () => {
    const result = validateEmail('user@');
    expect(result.isValid).toBe(false);
  });

  it('returns invalid for missing TLD', () => {
    const result = validateEmail('user@domain');
    expect(result.isValid).toBe(false);
  });

  it('returns valid for a properly formatted email', () => {
    const result = validateEmail('user@example.com');
    expect(result.isValid).toBe(true);
    expect(result.error).toBeUndefined();
  });
});

describe('validatePassword', () => {
  it('returns invalid for undefined', () => {
    const result = validatePassword(undefined);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Password is required');
  });

  it('returns invalid for empty string', () => {
    const result = validatePassword('');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Password is required');
  });

  it('returns invalid for password shorter than minimum length', () => {
    const result = validatePassword('a'.repeat(PASSWORD_MIN_LENGTH - 1));
    expect(result.isValid).toBe(false);
    expect(result.error).toContain(`at least ${PASSWORD_MIN_LENGTH}`);
  });

  it('returns valid for password at minimum length', () => {
    const result = validatePassword('a'.repeat(PASSWORD_MIN_LENGTH));
    expect(result.isValid).toBe(true);
  });

  it('returns invalid for password longer than maximum length', () => {
    const result = validatePassword('a'.repeat(PASSWORD_MAX_LENGTH + 1));
    expect(result.isValid).toBe(false);
    expect(result.error).toContain(`at most ${PASSWORD_MAX_LENGTH}`);
  });

  it('returns invalid when password contains the username', () => {
    const result = validatePassword('mypassworduser123', 'user123');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('username');
  });

  it('is case-insensitive when checking username in password', () => {
    const result = validatePassword('mypasswordUSER123', 'user123');
    expect(result.isValid).toBe(false);
  });

  it('returns invalid when password contains the email address', () => {
    const result = validatePassword('mypassworduser@example.com', undefined, 'user@example.com');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('email');
  });

  it('returns invalid when password contains the email local part', () => {
    const result = validatePassword('passwordwithuserpart', undefined, 'userpart@example.com');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('email');
  });

  it('returns valid with no username or email checks', () => {
    const result = validatePassword('strongpassword99');
    expect(result.isValid).toBe(true);
  });
});

describe('helper text functions', () => {
  it('getUsernameHelperText returns a non-empty string', () => {
    expect(typeof getUsernameHelperText()).toBe('string');
    expect(getUsernameHelperText().length).toBeGreaterThan(0);
  });

  it('getEmailHelperText returns a non-empty string', () => {
    expect(typeof getEmailHelperText()).toBe('string');
    expect(getEmailHelperText().length).toBeGreaterThan(0);
  });

  it('getPasswordHelperText returns a non-empty string', () => {
    expect(typeof getPasswordHelperText()).toBe('string');
    expect(getPasswordHelperText().length).toBeGreaterThan(0);
  });
});

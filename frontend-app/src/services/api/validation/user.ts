/**
 * User validation utilities
 */

// Constants
export const USERNAME_MIN_LENGTH = 2;
export const USERNAME_MAX_LENGTH = 50;
export const USERNAME_PATTERN = /^\w+$/; // Only letters, numbers, and underscores

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

// Types
export type ValidationResult = {
  isValid: boolean;
  error?: string;
};

// Methods
export function validateUsername(value: string | undefined): ValidationResult {
  const username = typeof value === 'string' ? value.trim() : '';

  if (!username) {
    return { isValid: false, error: 'Username is required' };
  }

  if (username.length < USERNAME_MIN_LENGTH) {
    return {
      isValid: false,
      error: `Username must be at least ${USERNAME_MIN_LENGTH} characters`,
    };
  }

  if (username.length > USERNAME_MAX_LENGTH) {
    return {
      isValid: false,
      error: `Username must be at most ${USERNAME_MAX_LENGTH} characters`,
    };
  }

  if (!USERNAME_PATTERN.test(username)) {
    return {
      isValid: false,
      error: 'Username can only contain letters, numbers, and underscores',
    };
  }

  return { isValid: true };
}

export function getUsernameHelperText(): string {
  return `Username must be ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} characters and contain only letters, numbers, and underscores`;
}

export function validateEmail(value: string | undefined): ValidationResult {
  const email = typeof value === 'string' ? value.trim() : '';

  if (!email) {
    return { isValid: false, error: 'Email is required' };
  }

  // Basic email format validation
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    return { isValid: false, error: 'Please enter a valid email address' };
  }

  return { isValid: true };
}

export function getEmailHelperText(): string {
  return 'Enter a valid email address';
}

export function validatePassword(value: string | undefined, username?: string, email?: string): ValidationResult {
  const password = typeof value === 'string' ? value : '';

  if (!password) {
    return { isValid: false, error: 'Password is required' };
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      isValid: false,
      error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
    };
  }

  if (password.length > PASSWORD_MAX_LENGTH) {
    return {
      isValid: false,
      error: `Password must be at most ${PASSWORD_MAX_LENGTH} characters`,
    };
  }

  // Check if password contains username
  if (username && password.toLowerCase().includes(username.toLowerCase())) {
    return {
      isValid: false,
      error: 'Password cannot contain your username',
    };
  }

  // Check if password contains email or email username part
  if (email) {
    const emailUsername = email.split('@')[0];
    if (
      password.toLowerCase().includes(email.toLowerCase()) ||
      password.toLowerCase().includes(emailUsername.toLowerCase())
    ) {
      return {
        isValid: false,
        error: 'Password cannot contain your email address',
      };
    }
  }

  return { isValid: true };
}

export function getPasswordHelperText(): string {
  return `Password must be ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters and cannot contain your username or email`;
}

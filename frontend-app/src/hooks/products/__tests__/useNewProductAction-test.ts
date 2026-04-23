import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Router } from 'expo-router';
import type { DialogContextType, DialogOptions } from '@/components/common/dialogContext';
import { useNewProductAction } from '../useNewProductAction';

const mockSetNewProductIntent = jest.fn();

jest.mock('@/services/newProductStore', () => ({
  setNewProductIntent: (...args: unknown[]) => mockSetNewProductIntent(...args),
}));

function makeDialog(): DialogContextType & {
  alert: jest.Mock;
  input: jest.Mock;
  toast: jest.Mock;
} {
  return {
    alert: jest.fn(),
    input: jest.fn(),
    toast: jest.fn(),
  };
}

function makeRouter() {
  return { push: jest.fn() } as unknown as Router & { push: jest.Mock };
}

describe('useNewProductAction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('prompts the user to sign in when there is no current user', () => {
    const dialog = makeDialog();
    const router = makeRouter();
    const run = useNewProductAction({ dialog, router, currentUser: null });

    run();

    expect(dialog.alert).toHaveBeenCalledTimes(1);
    const opts = dialog.alert.mock.calls[0][0] as DialogOptions;
    expect(opts.title).toBe('Sign In Required');
    const signInBtn = opts.buttons?.find((b) => b.text === 'Sign in');
    signInBtn?.onPress?.();
    expect(router.push).toHaveBeenCalledWith('/login?redirectTo=/products');
    expect(dialog.input).not.toHaveBeenCalled();
  });

  it('asks the user to verify email when unverified', () => {
    const dialog = makeDialog();
    const router = makeRouter();
    const run = useNewProductAction({
      dialog,
      router,
      currentUser: { isVerified: false },
    });

    run();

    expect(dialog.alert).toHaveBeenCalledTimes(1);
    const opts = dialog.alert.mock.calls[0][0] as DialogOptions;
    expect(opts.title).toBe('Email Verification Required');
    const profileBtn = opts.buttons?.find((b) => b.text === 'Go to Profile');
    profileBtn?.onPress?.();
    expect(router.push).toHaveBeenCalledWith('/profile');
    expect(dialog.input).not.toHaveBeenCalled();
  });

  it('opens the name input dialog for a verified user and navigates on submit', () => {
    const dialog = makeDialog();
    const router = makeRouter();
    const run = useNewProductAction({
      dialog,
      router,
      currentUser: { isVerified: true },
    });

    run();

    expect(dialog.alert).not.toHaveBeenCalled();
    expect(dialog.input).toHaveBeenCalledTimes(1);
    const opts = dialog.input.mock.calls[0][0] as DialogOptions;
    const okBtn = opts.buttons?.find((b) => b.text === 'OK');

    okBtn?.onPress?.('  My Widget  ');

    expect(mockSetNewProductIntent).toHaveBeenCalledWith({ name: 'My Widget' });
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/products/[id]',
      params: { id: 'new' },
    });
  });

  it('disables OK for names shorter than 2 or longer than 100 characters', () => {
    const dialog = makeDialog();
    const run = useNewProductAction({
      dialog,
      router: makeRouter(),
      currentUser: { isVerified: true },
    });

    run();

    const opts = dialog.input.mock.calls[0][0] as DialogOptions;
    const okBtn = opts.buttons?.find((b) => b.text === 'OK');
    const disabled = okBtn?.disabled;
    expect(typeof disabled).toBe('function');
    if (typeof disabled !== 'function') return;

    expect(disabled('')).toBe(true);
    expect(disabled(' a ')).toBe(true);
    expect(disabled('ok')).toBe(false);
    expect(disabled('x'.repeat(100))).toBe(false);
    expect(disabled('x'.repeat(101))).toBe(true);
  });
});

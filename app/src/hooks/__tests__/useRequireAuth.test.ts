import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import { useRequireAuth } from '@/hooks/useRequireAuth';

const mockUseAuth = jest.fn();
const mockScreenFocused = jest.fn(() => true);

jest.mock('@/context/auth', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/hooks/useScreenFocused', () => ({
  __esModule: true,
  useScreenFocusedSafe: () => mockScreenFocused(),
}));

const mockUser = { id: 'user-1', username: 'tester' };

describe('useRequireAuth', () => {
  const mockReplace = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockScreenFocused.mockReturnValue(true);
    (useRouter as jest.Mock).mockReturnValue({
      push: jest.fn(),
      replace: mockReplace,
      back: jest.fn(),
      setParams: jest.fn(),
    });
  });

  // Regression: a tab-group screen stays mounted off-focus, so a delayed
  // sign-out effect can clear the user after focus has already moved
  // elsewhere. The guard must not fire in that case, or it clobbers
  // whatever navigation already happened with a stray /login redirect.
  it('does not redirect when the user clears after the screen has already lost focus', () => {
    mockScreenFocused.mockReturnValue(false);
    mockUseAuth.mockReturnValue({ user: mockUser, isLoading: false });

    const { rerender } = renderHook(() => useRequireAuth('/cameras'));

    mockUseAuth.mockReturnValue({ user: undefined, isLoading: false });
    rerender({});

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('still redirects to login when the session expires while the screen is focused', () => {
    mockScreenFocused.mockReturnValue(true);
    mockUseAuth.mockReturnValue({ user: mockUser, isLoading: false });

    const { rerender } = renderHook(() => useRequireAuth('/cameras'));

    mockUseAuth.mockReturnValue({ user: undefined, isLoading: false });
    rerender({});

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/login',
      params: { redirectTo: '/cameras' },
    });
  });

  it('does not redirect while the initial auth check is still loading', () => {
    mockUseAuth.mockReturnValue({ user: undefined, isLoading: true });

    renderHook(() => useRequireAuth('/cameras'));

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('does not redirect while isLoggingOut is true, even once focused and resolved', () => {
    mockUseAuth.mockReturnValue({ user: undefined, isLoading: false });

    renderHook(() => useRequireAuth('/account', { isLoggingOut: true }));

    expect(mockReplace).not.toHaveBeenCalled();
  });
});

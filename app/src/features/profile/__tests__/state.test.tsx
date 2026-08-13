import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';
import type { useRouter } from 'expo-router';
import type { useAuth } from '@/context/auth';
import { useProfileAuthRedirect } from '@/features/profile/state';

const mockScreenFocused = jest.fn(() => true);
jest.mock('@/hooks/useScreenFocused', () => ({
  __esModule: true,
  useScreenFocusedSafe: () => mockScreenFocused(),
}));

type Profile = ReturnType<typeof useAuth>['user'];
type Props = { profile: Profile; isLoggingOut: boolean };

const mockProfile = { id: 'user-1', username: 'tester' } as unknown as Profile;

describe('useProfileAuthRedirect', () => {
  const mockReplace = jest.fn();
  const router = { replace: mockReplace } as unknown as ReturnType<typeof useRouter>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockScreenFocused.mockReturnValue(true);
  });

  // Regression: the account tab stays mounted after logout navigates away (tab
  // groups preserve state). Logout flips `isLoggingOut` back to `false` before
  // its `refetch(false)` resolves and clears `profile`, so the profile clears
  // on a render *after* the tab has already lost focus to /products. The
  // guard must not fire in that case, or it clobbers the /products navigation
  // with a redirect to /login.
  it('does not redirect when the profile clears after the screen has already lost focus', () => {
    mockScreenFocused.mockReturnValue(false);

    const { rerender } = renderHook<void, Props>(
      ({ profile, isLoggingOut }) => useProfileAuthRedirect({ profile, router, isLoggingOut }),
      { initialProps: { profile: mockProfile, isLoggingOut: true } },
    );

    // isLoggingOut flips back to false while profile is still the stale value.
    rerender({ profile: mockProfile, isLoggingOut: false });
    expect(mockReplace).not.toHaveBeenCalled();

    // refetch(false) resolves later and clears the profile; the tab is
    // already unfocused (navigated to /products) by then.
    rerender({ profile: undefined, isLoggingOut: false });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('still redirects to login when the session expires while the screen is focused', () => {
    mockScreenFocused.mockReturnValue(true);

    const { rerender } = renderHook<void, Props>(
      ({ profile, isLoggingOut }) => useProfileAuthRedirect({ profile, router, isLoggingOut }),
      { initialProps: { profile: mockProfile, isLoggingOut: false } },
    );

    rerender({ profile: undefined, isLoggingOut: false });

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/login',
      params: { redirectTo: '/account' },
    });
  });
});

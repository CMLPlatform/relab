import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useProductsWelcomeCard } from '@/features/products/useProductsWelcomeCard';
import { updateUser } from '@/services/api/auth/authentication';
import { getLocalItem, setLocalItem } from '@/services/storage';

jest.mock('@/services/api/auth/authentication', () => ({
  updateUser: jest.fn(),
}));

// On native these hit AsyncStorage directly and can reject (storage full or
// corrupt); the web paths already swallow their own errors.
jest.mock('@/services/storage', () => ({
  ...(jest.requireActual('@/services/storage') as object),
  getLocalItem: jest.fn(),
  setLocalItem: jest.fn(),
}));

const mockGetLocalItem = getLocalItem as jest.MockedFunction<typeof getLocalItem>;
const mockSetLocalItem = setLocalItem as jest.MockedFunction<typeof setLocalItem>;

const mockUpdateUser = updateUser as jest.MockedFunction<typeof updateUser>;

const store = new Map<string, string>();

beforeEach(() => {
  mockUpdateUser.mockResolvedValue(undefined);
  store.clear();
  mockGetLocalItem.mockImplementation(async (key: string) => store.get(key) ?? null);
  mockSetLocalItem.mockImplementation(async (key: string, value: string) => {
    store.set(key, value);
  });
});
afterEach(() => {
  mockUpdateUser.mockReset();
});

const dismissedUser = { preferences: { products_welcome_dismissed: true } };

describe('useProductsWelcomeCard — signed in', () => {
  it('reads the dismissal off the user preference, not local storage', async () => {
    const notDismissed = await renderHook(() =>
      useProductsWelcomeCard({ isAuthenticated: true, currentUser: {} }),
    );
    expect(notDismissed.result.current.showInfoCard).toBe(true);

    const dismissed = await renderHook(() =>
      useProductsWelcomeCard({ isAuthenticated: true, currentUser: dismissedUser }),
    );
    expect(dismissed.result.current.showInfoCard).toBe(false);
  });

  it('persists the dismissal to the server and refetches without forcing a cache bypass', async () => {
    const refetchUser = jest.fn<(forceRefresh?: boolean) => Promise<unknown>>();
    refetchUser.mockResolvedValue(undefined);
    const { result } = await renderHook(() =>
      useProductsWelcomeCard({ isAuthenticated: true, currentUser: {}, refetchUser }),
    );

    await act(async () => {
      await result.current.dismissInfoCard();
    });

    expect(mockUpdateUser).toHaveBeenCalledWith({
      preferences: { products_welcome_dismissed: true },
    });
    expect(refetchUser).toHaveBeenCalledWith(false);
  });

  it('does not write the guest key, which would outlive the account on a shared device', async () => {
    const { result } = await renderHook(() =>
      useProductsWelcomeCard({ isAuthenticated: true, currentUser: {} }),
    );

    await act(async () => {
      await result.current.dismissInfoCard();
    });

    expect(mockSetLocalItem).not.toHaveBeenCalled();
  });

  // Dismissing is a preference, not data entry: a failed PATCH must not surface
  // as an unhandled rejection in the press handler.
  it('swallows a failed preference write', async () => {
    mockUpdateUser.mockRejectedValue(new Error('offline'));
    const { result } = await renderHook(() =>
      useProductsWelcomeCard({ isAuthenticated: true, currentUser: {} }),
    );

    await act(async () => {
      await expect(result.current.dismissInfoCard()).resolves.toBeUndefined();
    });
  });
});

describe('useProductsWelcomeCard — guest', () => {
  it('holds showInfoCard at null until storage answers, so the card never flashes', async () => {
    // Held pending on purpose: `renderHook` flushes every settled update before
    // it resolves, so a storage read that already answered would hide the very
    // state under test.
    let answerStorage: (value: string | null) => void = () => {};
    mockGetLocalItem.mockReturnValue(
      new Promise<string | null>((resolve) => {
        answerStorage = resolve;
      }),
    );

    const { result } = await renderHook(() => useProductsWelcomeCard({ isAuthenticated: false }));
    expect(result.current.showInfoCard).toBeNull();

    await act(async () => {
      answerStorage(null);
    });
    await waitFor(() => expect(result.current.showInfoCard).toBe(true));
  });

  it('persists the dismissal locally and never calls the API', async () => {
    const { result } = await renderHook(() => useProductsWelcomeCard({ isAuthenticated: false }));
    await waitFor(() => expect(result.current.showInfoCard).toBe(true));

    await act(async () => {
      await result.current.dismissInfoCard();
    });

    expect(result.current.showInfoCard).toBe(false);
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(mockSetLocalItem).toHaveBeenCalledWith('products_info_card_dismissed_guest', 'true');
  });

  it('stays dismissed on remount from the persisted flag', async () => {
    const first = await renderHook(() => useProductsWelcomeCard({ isAuthenticated: false }));
    await waitFor(() => expect(first.result.current.showInfoCard).toBe(true));
    await act(async () => {
      await first.result.current.dismissInfoCard();
    });

    const second = await renderHook(() => useProductsWelcomeCard({ isAuthenticated: false }));
    await waitFor(() => expect(second.result.current.showInfoCard).toBe(false));
  });
});

describe('useProductsWelcomeCard — storage failures', () => {
  // A device whose storage is full or corrupt must still show the card rather
  // than sitting on the null placeholder forever.
  it('shows the card when the dismissal read fails', async () => {
    mockGetLocalItem.mockRejectedValue(new Error('storage unavailable'));
    const { result } = await renderHook(() => useProductsWelcomeCard({ isAuthenticated: false }));

    await waitFor(() => expect(result.current.showInfoCard).toBe(true));
  });

  it('still hides the card for this session when the dismissal write fails', async () => {
    mockSetLocalItem.mockRejectedValue(new Error('storage full'));
    const { result } = await renderHook(() => useProductsWelcomeCard({ isAuthenticated: false }));
    await waitFor(() => expect(result.current.showInfoCard).toBe(true));

    await act(async () => {
      await expect(result.current.dismissInfoCard()).resolves.toBeUndefined();
    });

    expect(result.current.showInfoCard).toBe(false);
  });
});

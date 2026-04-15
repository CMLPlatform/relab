import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useNewsletterPreference } from '@/hooks/profile/useNewsletterPreference';

const mockGetNewsletterPreference = jest.fn();
const mockSetNewsletterPreference = jest.fn();

jest.mock('@/services/api/newsletter', () => ({
  getNewsletterPreference: (...args: unknown[]) => mockGetNewsletterPreference(...args),
  setNewsletterPreference: (...args: unknown[]) => mockSetNewsletterPreference(...args),
}));

describe('useNewsletterPreference', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetNewsletterPreference.mockImplementation(async () => ({ subscribed: false }));
    mockSetNewsletterPreference.mockImplementation(async () => ({ subscribed: true }));
  });

  it('returns grouped state and actions', async () => {
    const { result } = renderHook(() => useNewsletterPreference(true));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.state.subscribed).toBe(false);
    expect(typeof result.current.actions.reload).toBe('function');
    expect(typeof result.current.actions.toggle).toBe('function');
  });

  it('loads the current newsletter preference', async () => {
    const { result } = renderHook(() => useNewsletterPreference(true));

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockGetNewsletterPreference).toHaveBeenCalled();
    expect(result.current.state.loading).toBe(false);
    expect(result.current.state.subscribed).toBe(false);
  });

  it('updates the preference through the named toggle action', async () => {
    const { result } = renderHook(() => useNewsletterPreference(true));

    await act(async () => {
      await Promise.resolve();
      await result.current.actions.toggle(true);
    });

    expect(mockSetNewsletterPreference).toHaveBeenCalledWith(true);
    expect(result.current.state.subscribed).toBe(true);
  });
});

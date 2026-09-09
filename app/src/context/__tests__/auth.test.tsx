import { describe, expect, it } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';
import { AuthContext, useAuth } from '@/context/auth';

describe('useAuth', () => {
  // Failing loudly beats handing a screen `undefined` and letting it read as
  // "signed out" when the provider is simply missing from the tree.
  it('throws when used outside AuthProvider', async () => {
    await expect(renderHook(() => useAuth())).rejects.toThrow(
      'useAuth must be used within AuthProvider',
    );
  });

  it('returns the context value when provided', async () => {
    const value = { user: undefined, isLoading: false, refetch: async () => undefined };
    const { result } = await renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthContext value={value}>{children}</AuthContext>,
    });

    expect(result.current).toBe(value);
  });
});

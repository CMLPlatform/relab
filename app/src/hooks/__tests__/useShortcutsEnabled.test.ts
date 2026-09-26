import { describe, expect, it, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { setShortcutsEnabled, useShortcutsEnabled } from '@/hooks/useShortcutsEnabled';
import { setLocalItem } from '@/services/storage';

jest.mock('@/services/storage', () => ({
  getLocalItem: jest.fn(async () => 'false'),
  setLocalItem: jest.fn(async () => {}),
}));

describe('useShortcutsEnabled', () => {
  it('reads and writes the stored flag as a bare "true"/"false" string', async () => {
    const { result } = await renderHook(() => useShortcutsEnabled());
    await waitFor(() => expect(result.current).toBe(false));

    await act(async () => {
      setShortcutsEnabled(true);
    });

    expect(result.current).toBe(true);
    expect(setLocalItem).toHaveBeenLastCalledWith('relab-keyboard-shortcuts', 'true');
  });
});

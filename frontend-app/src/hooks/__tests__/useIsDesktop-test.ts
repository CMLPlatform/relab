import { describe, it, expect } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';
import { useIsDesktop } from '../useIsDesktop';

// Platform is native by default in Jest (Platform.OS === 'ios')
describe('useIsDesktop', () => {
  it('returns false on native (not web)', () => {
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(false);
  });
});

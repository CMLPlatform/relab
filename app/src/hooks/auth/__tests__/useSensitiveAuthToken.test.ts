import { describe, expect, it, jest } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { useSensitiveAuthToken } from '../useSensitiveAuthToken';

describe('useSensitiveAuthToken', () => {
  it('keeps native route tokens live across rerenders', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');

    const { result, rerender } = renderHook(
      ({ routeToken }: { routeToken: string | undefined }) => useSensitiveAuthToken(routeToken),
      { initialProps: { routeToken: undefined } },
    );

    expect(result.current).toBeUndefined();

    rerender({ routeToken: 'native-route-token' });

    expect(result.current).toBe('native-route-token');
  });

  it('captures web fragment tokens before scrubbing the URL', () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        hash: '#token=fragment-token',
        pathname: '/verify',
        search: '?utm=ignored',
      },
    });
    const replaceStateSpy = jest.spyOn(window.history, 'replaceState').mockImplementation(() => {
      window.location.hash = '';
    });

    const { result, rerender } = renderHook(
      ({ routeToken }: { routeToken: string | undefined }) => useSensitiveAuthToken(routeToken),
      { initialProps: { routeToken: 'route-token' } },
    );

    expect(result.current).toBe('fragment-token');
    expect(replaceStateSpy).toHaveBeenCalledWith({}, '', '/verify?utm=ignored');

    rerender({ routeToken: 'changed-route-token' });

    expect(result.current).toBe('fragment-token');

    replaceStateSpy.mockRestore();
  });
});

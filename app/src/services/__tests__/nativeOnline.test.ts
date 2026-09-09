import { describe, expect, it, type jest } from '@jest/globals';
import { onlineManager } from '@tanstack/react-query';
import { addNetworkStateListener } from 'expo-network';
import { Platform } from 'react-native';
import { registerNativeOnlineListener } from '@/services/nativeOnline';

// The native connectivity bridge: without it onlineManager stays online forever
// on a device and no mutation ever pauses. The web path keeps TanStack's own
// window online/offline listener, so this only registers off-web.
// expo-network is mocked in config/setup.shared.ts.
const addListener = addNetworkStateListener as jest.Mock;

/** Re-register the listener with Platform.OS forced to `os`, returning the emitter. */
function registerOn(os: string) {
  const original = Platform.OS;
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
  try {
    addListener.mockClear();
    registerNativeOnlineListener();
  } finally {
    Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
  }
  return addListener.mock.calls[0]?.[0] as
    | ((state: { isConnected?: boolean | null; isInternetReachable?: boolean | null }) => void)
    | undefined;
}

describe('registerNativeOnlineListener', () => {
  it('flips onlineManager from network state changes on native', () => {
    const emit = registerOn('ios');
    expect(emit).toBeDefined();

    emit?.({ isConnected: true, isInternetReachable: false });
    expect(onlineManager.isOnline()).toBe(false);

    emit?.({ isConnected: false, isInternetReachable: null });
    expect(onlineManager.isOnline()).toBe(false);

    emit?.({ isConnected: true, isInternetReachable: true });
    expect(onlineManager.isOnline()).toBe(true);
  });

  it('treats unknown reachability as online, so a silent probe never blocks saves', () => {
    const emit = registerOn('ios');

    emit?.({ isConnected: false, isInternetReachable: false });
    expect(onlineManager.isOnline()).toBe(false);

    emit?.({ isConnected: null, isInternetReachable: null });
    expect(onlineManager.isOnline()).toBe(true);
  });

  it('removes the previous subscription when the listener is replaced', () => {
    registerOn('ios');
    const subscription = addListener.mock.results[0]?.value as { remove: jest.Mock };

    registerOn('ios');

    expect(subscription.remove).toHaveBeenCalled();
  });

  it('registers no native listener on web', () => {
    expect(registerOn('web')).toBeUndefined();
    expect(addListener).not.toHaveBeenCalled();
  });
});

import { onlineManager } from '@tanstack/react-query';
import { addNetworkStateListener } from 'expo-network';
import { Platform } from 'react-native';

/**
 * Teach TanStack Query about native connectivity.
 *
 * Its built-in listener is browser-only (window online/offline), so without this
 * a native build stays online forever: save mutations never pause and the
 * queued-offline UI (OfflineBanner, QUEUED_OFFLINE_LABEL, isPaused) is dead code.
 * Only an explicit `false` counts as offline — unknown (null) reachability fails
 * open, so a probe that cannot answer never blocks a save. Called once from the
 * app root; on web it is a no-op and TanStack keeps its own listener.
 */
export function registerNativeOnlineListener(): void {
  if (Platform.OS === 'web') return;
  onlineManager.setEventListener((setOnline) => {
    const subscription = addNetworkStateListener(({ isConnected, isInternetReachable }) => {
      setOnline(isConnected !== false && isInternetReachable !== false);
    });
    return () => subscription.remove();
  });
}

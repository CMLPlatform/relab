/**
 * Local direct-connection mode for RPi cameras.
 *
 * When a camera is physically connected to the same machine via Ethernet or a
 * USB-C to Ethernet adapter, the frontend can bypass the backend WebSocket relay
 * and talk directly to the Pi's FastAPI (:8018) and MediaMTX (:8888) endpoints.
 *
 * Benefits:
 *  - LL-HLS preview latency drops from ~1.5–3 s to ~0.4–0.8 s
 *  - Works with no internet connection
 *  - Lower backend bandwidth usage
 *
 * The relay connection on the Pi keeps running in parallel, so remote users
 * accessing the same camera via the backend continue to work unchanged.
 *
 * Usage:
 *   const { mode, connectionInfo, configure, clearLocalConnection } = useLocalConnection(cameraId);
 *
 * Setup flow (one-time per camera):
 *   1. User plugs Ethernet / USB-C cable
 *   2. App probes the stored local URL (or default link-local address)
 *   3. If reachable → prompts for the local API key (copy from Pi's /setup page)
 *   4. Stores URL + key in SecureStore; subsequent plug-ins auto-activate
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ConnectionMode = 'probing' | 'local' | 'relay';

export interface CameraConnectionInfo {
  /** Active connection mode. */
  mode: ConnectionMode;
  /** Base URL of the Pi's FastAPI server, e.g. "http://192.168.1.100:8018" */
  localBaseUrl: string | null;
  /** Base URL of the Pi's MediaMTX server, e.g. "http://192.168.1.100:8888" */
  localMediaUrl: string | null;
  /** API key for direct calls to the Pi (from Pi's /setup page). */
  localApiKey: string | null;
}

export interface UseLocalConnectionResult extends CameraConnectionInfo {
  /** Configure local mode: store the URL and API key, then activate immediately. */
  configure: (baseUrl: string, apiKey: string) => Promise<void>;
  /** Remove stored local connection config and revert to relay mode. */
  clearLocalConnection: () => Promise<void>;
  /** True while the initial storage load + first probe is in flight. */
  isInitializing: boolean;
}

// ─── Storage keys ─────────────────────────────────────────────────────────────

const urlKey = (cameraId: string) => `localConnection:${cameraId}:url`;
// SecureStore key names must be alphanumeric + _ + - (no colons on all platforms)
const apiKeySecureKey = (cameraId: string) => `localConnection_${cameraId}_apiKey`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Derive the media server URL from the API server URL by swapping the port.
 * e.g. "http://192.168.1.100:8018" → "http://192.168.1.100:8888"
 */
function deriveMediaUrl(baseUrl: string): string {
  try {
    const u = new URL(baseUrl);
    u.port = '8888';
    return u.origin;
  } catch {
    return baseUrl.replace(':8018', ':8888');
  }
}

/** Default link-local / USB gadget IP to probe first (no mDNS needed). */
const USB_GADGET_DEFAULT = 'http://192.168.7.1:8018';
/** Probe timeout in ms. Short enough to not visibly delay the UI. */
const PROBE_TIMEOUT_MS = 3_000;
/** Re-probe interval when local mode is active. */
const PROBE_INTERVAL_ACTIVE_MS = 30_000;
/** Consecutive failures before switching from local → relay. */
const MAX_FAILURES_BEFORE_RELAY = 2;

async function probeLocalUrl(baseUrl: string, apiKey: string | null): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (apiKey) headers['X-API-Key'] = apiKey;
    const resp = await fetch(`${baseUrl}/camera`, { headers, signal: controller.signal });
    return resp.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// ─── SecureStore / AsyncStorage wrappers ─────────────────────────────────────
// SecureStore is not available on web; fall back to AsyncStorage.

async function storeApiKey(cameraId: string, key: string): Promise<void> {
  if (Platform.OS !== 'web') {
    await SecureStore.setItemAsync(apiKeySecureKey(cameraId), key);
  } else {
    await AsyncStorage.setItem(apiKeySecureKey(cameraId), key);
  }
}

async function loadApiKey(cameraId: string): Promise<string | null> {
  if (Platform.OS !== 'web') {
    return SecureStore.getItemAsync(apiKeySecureKey(cameraId));
  }
  return AsyncStorage.getItem(apiKeySecureKey(cameraId));
}

async function deleteApiKey(cameraId: string): Promise<void> {
  if (Platform.OS !== 'web') {
    await SecureStore.deleteItemAsync(apiKeySecureKey(cameraId));
  } else {
    await AsyncStorage.removeItem(apiKeySecureKey(cameraId));
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useLocalConnection(cameraId: string): UseLocalConnectionResult {
  const [mode, setMode] = useState<ConnectionMode>('probing');
  const [localBaseUrl, setLocalBaseUrl] = useState<string | null>(null);
  const [localApiKey, setLocalApiKey] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  const consecutiveFailures = useRef(0);
  const probeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Keep a ref so the interval callback always has the current values without
  // triggering extra re-renders.
  const stateRef = useRef({ localBaseUrl, localApiKey });
  stateRef.current = { localBaseUrl, localApiKey };

  // ── Probe function ──────────────────────────────────────────────────────
  const runProbe = useCallback(async (url: string, apiKey: string | null) => {
    const ok = await probeLocalUrl(url, apiKey);
    if (ok) {
      consecutiveFailures.current = 0;
      setMode('local');
    } else {
      consecutiveFailures.current += 1;
      if (consecutiveFailures.current >= MAX_FAILURES_BEFORE_RELAY) {
        setMode('relay');
      }
    }
  }, []);

  // ── Initialise from storage ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function init() {
      const [storedUrl, storedKey] = await Promise.all([
        AsyncStorage.getItem(urlKey(cameraId)),
        loadApiKey(cameraId),
      ]);

      if (cancelled) return;

      const url = storedUrl ?? null;
      const key = storedKey ?? null;
      setLocalBaseUrl(url);
      setLocalApiKey(key);

      if (url) {
        // We have a configured URL — probe immediately
        await runProbe(url, key);
      } else {
        // No URL configured — try the USB gadget default silently
        const ok = await probeLocalUrl(USB_GADGET_DEFAULT, key);
        if (!cancelled && ok) {
          // Auto-discovered the Pi at the USB gadget address.
          // Don't auto-enable: mode stays 'probing' until user confirms with
          // the API key. Surface this via mode='probing' + localBaseUrl hint.
          setLocalBaseUrl(USB_GADGET_DEFAULT);
          setMode('probing');
        } else if (!cancelled) {
          setMode('relay');
        }
      }

      if (!cancelled) setIsInitializing(false);
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [cameraId, runProbe]);

  // ── Periodic re-probe when a URL is configured ──────────────────────────
  useEffect(() => {
    if (probeIntervalRef.current) {
      clearInterval(probeIntervalRef.current);
    }
    if (!localBaseUrl) return;

    probeIntervalRef.current = setInterval(() => {
      const { localBaseUrl: url, localApiKey: key } = stateRef.current;
      if (url) void runProbe(url, key);
    }, PROBE_INTERVAL_ACTIVE_MS);

    return () => {
      if (probeIntervalRef.current) clearInterval(probeIntervalRef.current);
    };
  }, [localBaseUrl, runProbe]);

  // ── configure: store and activate ──────────────────────────────────────
  const configure = useCallback(
    async (baseUrl: string, apiKey: string) => {
      const normalised = baseUrl.replace(/\/$/, '');
      await Promise.all([
        AsyncStorage.setItem(urlKey(cameraId), normalised),
        storeApiKey(cameraId, apiKey),
      ]);
      setLocalBaseUrl(normalised);
      setLocalApiKey(apiKey);
      consecutiveFailures.current = 0;
      // Probe immediately so mode updates without waiting for the next interval
      await runProbe(normalised, apiKey);
    },
    [cameraId, runProbe],
  );

  // ── clearLocalConnection: remove stored config ──────────────────────────
  const clearLocalConnection = useCallback(async () => {
    await Promise.all([AsyncStorage.removeItem(urlKey(cameraId)), deleteApiKey(cameraId)]);
    setLocalBaseUrl(null);
    setLocalApiKey(null);
    setMode('relay');
    consecutiveFailures.current = 0;
    if (probeIntervalRef.current) {
      clearInterval(probeIntervalRef.current);
      probeIntervalRef.current = null;
    }
  }, [cameraId]);

  const localMediaUrl = localBaseUrl ? deriveMediaUrl(localBaseUrl) : null;

  return {
    mode,
    localBaseUrl,
    localMediaUrl,
    localApiKey,
    configure,
    clearLocalConnection,
    isInitializing,
  };
}

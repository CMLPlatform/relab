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
 * ## Auto-configuration (medium-term / zero-copy setup)
 *
 * When the camera is online, the hook fetches local access info through the
 * relay (GET /cameras/{id}/local-access → Pi's /local-access-info). The Pi
 * returns its API key and all its LAN IP addresses. The hook probes each
 * candidate URL in parallel; the first that responds activates local mode
 * automatically — no manual key copying required.
 *
 * If the camera is offline or the relay call fails, the hook falls back to
 * any previously-stored URL/key or the USB gadget default address. Users can
 * still configure manually via the returned `configure()` function.
 *
 * Usage:
 *   const conn = useLocalConnection(cameraId, { isOnline });
 *   // conn.mode: 'probing' | 'local' | 'relay'
 *   // conn.localBaseUrl, conn.localApiKey populated when mode === 'local'
 */

import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  createInitialLocalConnectionState,
  localConnectionReducer,
  normalizeLocalConnectionUrl,
} from '@/hooks/local-connection/reducer';
import {
  buildLocalProbeCandidates,
  clearStoredLocalConnection,
  loadLocalConnection,
  MAX_FAILURES_BEFORE_RELAY,
  PROBE_INTERVAL_ACTIVE_MS,
  probeAll,
  probeLocalUrl,
  storeLocalConnection,
  USB_GADGET_DEFAULT,
} from '@/hooks/local-connection/shared';
import { fetchLocalAccessInfo } from '@/services/api/rpiCamera';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ConnectionMode = 'probing' | 'local' | 'relay';

export interface CameraConnectionInfo {
  /** Active connection mode. */
  mode: ConnectionMode;
  /** Base URL of the Pi's FastAPI server, e.g. "http://192.168.1.100:8018" */
  localBaseUrl: string | null;
  /** Base URL of the Pi's MediaMTX server, e.g. "http://192.168.1.100:8888" */
  localMediaUrl: string | null;
  /** API key for direct calls to the Pi. */
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

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseLocalConnectionOptions {
  /** Pass the relay online status so the hook knows when to try relay bootstrap. */
  isOnline?: boolean;
}

export function useLocalConnection(
  cameraId: string,
  { isOnline = false }: UseLocalConnectionOptions = {},
): UseLocalConnectionResult {
  const [state, dispatch] = useReducer(
    localConnectionReducer,
    undefined,
    createInitialLocalConnectionState,
  );
  const { mode, localBaseUrl, localMediaUrl, localApiKey, isInitializing } = state;

  const consecutiveFailures = useRef(0);
  const probeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastBootstrapCameraIdRef = useRef(cameraId);
  // Keep a ref so the interval callback and bootstrap effect always have the
  // current values without triggering extra re-renders.
  const stateRef = useRef({ localBaseUrl, localApiKey, mode });
  stateRef.current = { localBaseUrl, localApiKey, mode };

  // ── Probe function ──────────────────────────────────────────────────────
  const runProbe = useCallback(async (url: string, apiKey: string | null) => {
    const ok = await probeLocalUrl(url, apiKey);
    if (ok) {
      consecutiveFailures.current = 0;
      dispatch({ type: 'setMode', payload: 'local' });
    } else {
      consecutiveFailures.current += 1;
      if (consecutiveFailures.current >= MAX_FAILURES_BEFORE_RELAY) {
        dispatch({ type: 'setMode', payload: 'relay' });
      }
    }
  }, []);

  // ── activateLocalMode: store and switch state ───────────────────────────
  const activateLocalMode = useCallback(
    async (url: string, apiKey: string) => {
      const normalised = normalizeLocalConnectionUrl(url);
      await storeLocalConnection(cameraId, normalised, apiKey);
      consecutiveFailures.current = 0;
      dispatch({
        type: 'activate',
        payload: { localBaseUrl: normalised, localApiKey: apiKey },
      });
    },
    [cameraId],
  );

  // ── Initialise from storage ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function init() {
      const { url: storedUrl, apiKey: storedKey } = await loadLocalConnection(cameraId);

      if (cancelled) return;

      const url = storedUrl ?? null;
      const key = storedKey ?? null;
      dispatch({
        type: 'restore',
        payload: {
          localBaseUrl: url,
          localApiKey: key,
        },
      });

      if (url) {
        // We have a configured URL — probe immediately
        await runProbe(url, key);
      } else {
        // No URL configured — try the USB gadget default silently
        const ok = await probeLocalUrl(USB_GADGET_DEFAULT, key);
        if (!cancelled && ok) {
          dispatch({
            type: 'restore',
            payload: {
              localBaseUrl: USB_GADGET_DEFAULT,
              localApiKey: key,
            },
          });
          dispatch({ type: 'setMode', payload: 'probing' }); // reachable but no key yet — wait for relay bootstrap
        } else if (!cancelled) {
          dispatch({ type: 'setMode', payload: 'relay' });
        }
      }

      if (!cancelled) dispatch({ type: 'finishInitialization' });
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [cameraId, runProbe]);

  // ── Relay bootstrap: auto-fetch key + candidate URLs when camera is online ─
  // Runs whenever isOnline transitions to true (relay connect / reconnect after
  // Pi reboot). Skipped only when we are already in confirmed local mode —
  // the periodic probe handles keepalive in that case.
  useEffect(() => {
    if (lastBootstrapCameraIdRef.current !== cameraId) {
      lastBootstrapCameraIdRef.current = cameraId;
    }

    if (!isOnline) return;
    // Already in local mode — the 30s periodic probe keeps it alive.
    if (stateRef.current.mode === 'local') return;

    async function bootstrap() {
      const info = await fetchLocalAccessInfo(cameraId);
      if (!info?.local_api_key) return;

      const candidates = buildLocalProbeCandidates(info.candidate_urls);

      // Probe all in parallel — use the key from the Pi
      const reachableUrl = await probeAll(candidates, info.local_api_key);
      if (!reachableUrl) return;

      await activateLocalMode(reachableUrl, info.local_api_key);
    }

    void bootstrap();
  }, [cameraId, isOnline, activateLocalMode]);

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

  // ── configure: manual store and activate ───────────────────────────────
  const configure = useCallback(
    async (baseUrl: string, apiKey: string) => {
      const normalised = normalizeLocalConnectionUrl(baseUrl);
      await storeLocalConnection(cameraId, normalised, apiKey);
      dispatch({
        type: 'restore',
        payload: {
          localBaseUrl: normalised,
          localApiKey: apiKey,
        },
      });
      consecutiveFailures.current = 0;
      // Probe immediately so mode updates without waiting for the next interval
      await runProbe(normalised, apiKey);
    },
    [cameraId, runProbe],
  );

  // ── clearLocalConnection: remove stored config ──────────────────────────
  const clearLocalConnection = useCallback(async () => {
    await clearStoredLocalConnection(cameraId);
    dispatch({ type: 'clear' });
    consecutiveFailures.current = 0;
    if (probeIntervalRef.current) {
      clearInterval(probeIntervalRef.current);
      probeIntervalRef.current = null;
    }
  }, [cameraId]);

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

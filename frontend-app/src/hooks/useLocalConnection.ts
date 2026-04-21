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
 * relay (GET /cameras/{id}/local-access → Pi's /system/local-access). The Pi
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

function setRestoredConnection(
  dispatch: (action: {
    type: 'restore';
    payload: { localBaseUrl: string | null; localApiKey: string | null };
  }) => void,
  {
    localBaseUrl,
    localApiKey,
  }: {
    localBaseUrl: string | null;
    localApiKey: string | null;
  },
) {
  dispatch({
    type: 'restore',
    payload: { localBaseUrl, localApiKey },
  });
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: local-connection orchestration intentionally keeps probe and persistence logic together.
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

  useEffect(() => {
    stateRef.current = { localBaseUrl, localApiKey, mode };
  }, [localApiKey, localBaseUrl, mode]);

  const markLocalProbeSuccess = useCallback(() => {
    consecutiveFailures.current = 0;
    dispatch({ type: 'setMode', payload: 'local' });
  }, []);

  const markLocalProbeFailure = useCallback(() => {
    consecutiveFailures.current += 1;
    if (consecutiveFailures.current >= MAX_FAILURES_BEFORE_RELAY) {
      dispatch({ type: 'setMode', payload: 'relay' });
    }
  }, []);

  const runProbe = useCallback(
    async (url: string, apiKey: string | null) => {
      const ok = await probeLocalUrl(url, apiKey);
      if (ok) {
        markLocalProbeSuccess();
        return;
      }

      markLocalProbeFailure();
    },
    [markLocalProbeFailure, markLocalProbeSuccess],
  );

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

  const restoreStoredConnection = useCallback((url: string | null, apiKey: string | null) => {
    setRestoredConnection(dispatch, { localBaseUrl: url, localApiKey: apiKey });
  }, []);

  const fallBackToUsbGadget = useCallback(
    async (apiKey: string | null, cancelled: boolean) => {
      const ok = await probeLocalUrl(USB_GADGET_DEFAULT, apiKey);
      if (cancelled) return;

      if (ok) {
        restoreStoredConnection(USB_GADGET_DEFAULT, apiKey);
        dispatch({ type: 'setMode', payload: 'probing' });
        return;
      }

      dispatch({ type: 'setMode', payload: 'relay' });
    },
    [restoreStoredConnection],
  );

  useEffect(() => {
    let cancelled = false;

    async function initializeFromStorage() {
      const { url: storedUrl, apiKey: storedKey } = await loadLocalConnection(cameraId);
      if (cancelled) return;

      const restoredUrl = storedUrl ?? null;
      const restoredApiKey = storedKey ?? null;
      restoreStoredConnection(restoredUrl, restoredApiKey);

      if (restoredUrl) {
        await runProbe(restoredUrl, restoredApiKey);
      } else {
        await fallBackToUsbGadget(restoredApiKey, cancelled);
      }

      if (!cancelled) {
        dispatch({ type: 'finishInitialization' });
      }
    }

    void initializeFromStorage();
    return () => {
      cancelled = true;
    };
  }, [cameraId, fallBackToUsbGadget, restoreStoredConnection, runProbe]);

  const bootstrapFromRelay = useCallback(async () => {
    const info = await fetchLocalAccessInfo(cameraId);
    if (!info?.local_api_key) return;

    const candidates = buildLocalProbeCandidates(info.candidate_urls);
    const reachableUrl = await probeAll(candidates, info.local_api_key);
    if (!reachableUrl) return;

    await activateLocalMode(reachableUrl, info.local_api_key);
  }, [activateLocalMode, cameraId]);

  useEffect(() => {
    if (lastBootstrapCameraIdRef.current !== cameraId) {
      lastBootstrapCameraIdRef.current = cameraId;
    }

    if (!isOnline) return;
    if (stateRef.current.mode === 'local') return;

    void bootstrapFromRelay();
  }, [bootstrapFromRelay, cameraId, isOnline]);

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

  const configure = useCallback(
    async (baseUrl: string, apiKey: string) => {
      const normalised = normalizeLocalConnectionUrl(baseUrl);
      await storeLocalConnection(cameraId, normalised, apiKey);
      restoreStoredConnection(normalised, apiKey);
      consecutiveFailures.current = 0;
      await runProbe(normalised, apiKey);
    },
    [cameraId, restoreStoredConnection, runProbe],
  );

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

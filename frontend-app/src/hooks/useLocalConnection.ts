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

export type ConnectionMode = 'probing' | 'local' | 'relay';

export interface CameraConnectionInfo {
  mode: ConnectionMode;
  localBaseUrl: string | null;
  localMediaUrl: string | null;
  localApiKey: string | null;
}

export interface UseLocalConnectionResult extends CameraConnectionInfo {
  configure: (baseUrl: string, apiKey: string) => Promise<void>;
  clearLocalConnection: () => Promise<void>;
  isInitializing: boolean;
}

interface UseLocalConnectionOptions {
  isOnline?: boolean;
}

type LocalConnectionAction = Parameters<typeof localConnectionReducer>[1];
type LocalConnectionDispatch = (action: LocalConnectionAction) => void;

function setRestoredConnection(
  dispatch: LocalConnectionDispatch,
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

function useLocalProbeActions(cameraId: string, dispatch: LocalConnectionDispatch) {
  const consecutiveFailuresRef = useRef(0);
  const markLocalProbeSuccess = useCallback(() => {
    consecutiveFailuresRef.current = 0;
    dispatch({ type: 'setMode', payload: 'local' });
  }, [dispatch]);
  const markLocalProbeFailure = useCallback(() => {
    consecutiveFailuresRef.current += 1;
    if (consecutiveFailuresRef.current >= MAX_FAILURES_BEFORE_RELAY) {
      dispatch({ type: 'setMode', payload: 'relay' });
    }
  }, [dispatch]);
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
      consecutiveFailuresRef.current = 0;
      dispatch({
        type: 'activate',
        payload: { localBaseUrl: normalised, localApiKey: apiKey },
      });
    },
    [cameraId, dispatch],
  );
  const restoreStoredConnection = useCallback(
    (url: string | null, apiKey: string | null) => {
      setRestoredConnection(dispatch, { localBaseUrl: url, localApiKey: apiKey });
    },
    [dispatch],
  );

  return {
    consecutiveFailuresRef,
    runProbe,
    activateLocalMode,
    restoreStoredConnection,
  };
}

function useLocalConnectionInitialization({
  cameraId,
  dispatch,
  restoreStoredConnection,
  runProbe,
}: {
  cameraId: string;
  dispatch: LocalConnectionDispatch;
  restoreStoredConnection: (url: string | null, apiKey: string | null) => void;
  runProbe: (url: string, apiKey: string | null) => Promise<void>;
}) {
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
    [dispatch, restoreStoredConnection],
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
  }, [cameraId, dispatch, fallBackToUsbGadget, restoreStoredConnection, runProbe]);
}

function useLocalConnectionBootstrap({
  activateLocalMode,
  cameraId,
  isOnline,
  mode,
}: {
  activateLocalMode: (url: string, apiKey: string) => Promise<void>;
  cameraId: string;
  isOnline: boolean;
  mode: ConnectionMode;
}) {
  const lastBootstrapCameraIdRef = useRef(cameraId);
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

    if (!isOnline || mode === 'local') return;
    void bootstrapFromRelay();
  }, [bootstrapFromRelay, cameraId, isOnline, mode]);
}

function useLocalConnectionProbeLoop({
  localApiKey,
  localBaseUrl,
  runProbe,
}: {
  localApiKey: string | null;
  localBaseUrl: string | null;
  runProbe: (url: string, apiKey: string | null) => Promise<void>;
}) {
  const probeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stateRef = useRef({ localBaseUrl, localApiKey });

  useEffect(() => {
    stateRef.current = { localBaseUrl, localApiKey };
  }, [localApiKey, localBaseUrl]);

  useEffect(() => {
    if (probeIntervalRef.current) clearInterval(probeIntervalRef.current);
    if (!localBaseUrl) return;

    probeIntervalRef.current = setInterval(() => {
      const { localBaseUrl: url, localApiKey: key } = stateRef.current;
      if (url) void runProbe(url, key);
    }, PROBE_INTERVAL_ACTIVE_MS);

    return () => {
      if (probeIntervalRef.current) clearInterval(probeIntervalRef.current);
    };
  }, [localBaseUrl, runProbe]);

  return probeIntervalRef;
}

function useLocalConnectionActions({
  cameraId,
  clearProbeLoop,
  consecutiveFailuresRef,
  dispatch,
  restoreStoredConnection,
  runProbe,
}: {
  cameraId: string;
  clearProbeLoop: () => void;
  consecutiveFailuresRef: { current: number };
  dispatch: LocalConnectionDispatch;
  restoreStoredConnection: (url: string | null, apiKey: string | null) => void;
  runProbe: (url: string, apiKey: string | null) => Promise<void>;
}) {
  const configure = useCallback(
    async (baseUrl: string, apiKey: string) => {
      const normalised = normalizeLocalConnectionUrl(baseUrl);
      await storeLocalConnection(cameraId, normalised, apiKey);
      restoreStoredConnection(normalised, apiKey);
      consecutiveFailuresRef.current = 0;
      await runProbe(normalised, apiKey);
    },
    [cameraId, consecutiveFailuresRef, restoreStoredConnection, runProbe],
  );
  const clearLocalConnection = useCallback(async () => {
    await clearStoredLocalConnection(cameraId);
    dispatch({ type: 'clear' });
    consecutiveFailuresRef.current = 0;
    clearProbeLoop();
  }, [cameraId, clearProbeLoop, consecutiveFailuresRef, dispatch]);

  return { configure, clearLocalConnection };
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
  const { consecutiveFailuresRef, runProbe, activateLocalMode, restoreStoredConnection } =
    useLocalProbeActions(cameraId, dispatch);

  useLocalConnectionInitialization({
    cameraId,
    dispatch,
    restoreStoredConnection,
    runProbe,
  });
  useLocalConnectionBootstrap({ activateLocalMode, cameraId, isOnline, mode });

  const probeIntervalRef = useLocalConnectionProbeLoop({
    localApiKey,
    localBaseUrl,
    runProbe,
  });
  const { configure, clearLocalConnection } = useLocalConnectionActions({
    cameraId,
    clearProbeLoop: () => {
      if (probeIntervalRef.current) {
        clearInterval(probeIntervalRef.current);
        probeIntervalRef.current = null;
      }
    },
    consecutiveFailuresRef,
    dispatch,
    restoreStoredConnection,
    runProbe,
  });

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

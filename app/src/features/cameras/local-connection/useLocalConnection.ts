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

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { fetchLocalAccessInfo } from '@/services/api/rpiCamera';
import type { LocalAccessInfo } from '@/services/api/rpiCamera/shared';
import {
  createInitialLocalConnectionState,
  deriveLocalMediaUrl,
  localConnectionReducer,
  normalizeLocalConnectionUrl,
} from './reducer';
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
} from './shared';

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

// The card grid and the detail screen can request the same camera's access
// info concurrently; share the in-flight relay round-trip between them.
const inFlightAccessInfo = new Map<string, Promise<LocalAccessInfo | null>>();

function fetchLocalAccessInfoShared(cameraId: string): Promise<LocalAccessInfo | null> {
  const existing = inFlightAccessInfo.get(cameraId);
  if (existing) return existing;
  const request = fetchLocalAccessInfo(cameraId).finally(() => {
    inFlightAccessInfo.delete(cameraId);
  });
  inFlightAccessInfo.set(cameraId, request);
  return request;
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: one cohesive connection state machine — splitting it into single-use sub-hooks hid the cancellation logic (which is how the camera-switch races crept in).
export function useLocalConnection(
  cameraId: string,
  { isOnline = false }: UseLocalConnectionOptions = {},
): UseLocalConnectionResult {
  const [state, dispatch] = useReducer(
    localConnectionReducer,
    undefined,
    createInitialLocalConnectionState,
  );
  const { mode, localBaseUrl, localApiKey, isInitializing } = state;

  const consecutiveFailuresRef = useRef(0);
  // Bumped on unmount so async work from a previous mount can never dispatch
  // into the next one. Every call site keys this hook by camera id, so a
  // cameraId change always remounts the instance rather than mutating it in
  // place — there is no in-place cameraId transition to guard against.
  const generationRef = useRef(0);
  useEffect(() => {
    return () => {
      generationRef.current += 1;
    };
  }, []);

  const runProbe = useCallback(async (url: string, apiKey: string | null) => {
    const generation = generationRef.current;
    const ok = await probeLocalUrl(url, apiKey);
    if (generation !== generationRef.current) return;

    if (ok) {
      consecutiveFailuresRef.current = 0;
      dispatch({ type: 'setMode', payload: 'local' });
      return;
    }
    consecutiveFailuresRef.current += 1;
    if (consecutiveFailuresRef.current >= MAX_FAILURES_BEFORE_RELAY) {
      dispatch({ type: 'setMode', payload: 'relay' });
    }
  }, []);

  // ── Initialization: restore stored connection, else try the USB gadget ──
  useEffect(() => {
    // No camera (e.g. a null preview target) — stay in the relay/default state
    // rather than probing the USB gadget address for a nonexistent device.
    if (!cameraId) return;
    let cancelled = false;

    async function initializeFromStorage() {
      const { url: storedUrl, apiKey: storedKey } = await loadLocalConnection(cameraId);
      if (cancelled) return;

      const restoredUrl = storedUrl ?? null;
      const restoredApiKey = storedKey ?? null;
      dispatch({
        type: 'restore',
        payload: { localBaseUrl: restoredUrl, localApiKey: restoredApiKey },
      });

      if (restoredUrl) {
        await runProbe(restoredUrl, restoredApiKey);
      } else {
        const ok = await probeLocalUrl(USB_GADGET_DEFAULT, restoredApiKey);
        if (!cancelled) {
          if (ok) {
            dispatch({
              type: 'restore',
              payload: { localBaseUrl: USB_GADGET_DEFAULT, localApiKey: restoredApiKey },
            });
            dispatch({ type: 'setMode', payload: 'probing' });
          } else {
            dispatch({ type: 'setMode', payload: 'relay' });
          }
        }
      }

      if (!cancelled) {
        dispatch({ type: 'finishInitialization' });
      }
    }

    void initializeFromStorage();
    return () => {
      cancelled = true;
    };
  }, [cameraId, runProbe]);

  // ── Bootstrap: fetch access info via the relay and probe candidates ──
  useEffect(() => {
    if (!isOnline || mode === 'local') return;
    let cancelled = false;

    async function bootstrapFromRelay() {
      const info = await fetchLocalAccessInfoShared(cameraId);
      if (cancelled || !info?.local_api_key) return;

      const candidates = buildLocalProbeCandidates(info.candidate_urls);
      const reachableUrl = await probeAll(candidates, info.local_api_key);
      if (cancelled || !reachableUrl) return;

      const generation = generationRef.current;
      const normalised = normalizeLocalConnectionUrl(reachableUrl);
      await storeLocalConnection(cameraId, normalised, info.local_api_key);
      if (cancelled || generation !== generationRef.current) return;
      consecutiveFailuresRef.current = 0;
      dispatch({
        type: 'activate',
        payload: { localBaseUrl: normalised, localApiKey: info.local_api_key },
      });
    }

    void bootstrapFromRelay();
    return () => {
      cancelled = true;
    };
  }, [cameraId, isOnline, mode]);

  // ── Periodic re-probe while a local URL is configured ──
  const probeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const probeTargetRef = useRef({ localBaseUrl, localApiKey });
  useEffect(() => {
    probeTargetRef.current = { localBaseUrl, localApiKey };
  }, [localApiKey, localBaseUrl]);

  useEffect(() => {
    if (probeIntervalRef.current) clearInterval(probeIntervalRef.current);
    if (!localBaseUrl) return;

    probeIntervalRef.current = setInterval(() => {
      const { localBaseUrl: url, localApiKey: key } = probeTargetRef.current;
      if (url) void runProbe(url, key);
    }, PROBE_INTERVAL_ACTIVE_MS);

    return () => {
      if (probeIntervalRef.current) clearInterval(probeIntervalRef.current);
    };
  }, [localBaseUrl, runProbe]);

  // ── Manual configuration ──
  const configure = useCallback(
    async (baseUrl: string, apiKey: string) => {
      const normalised = normalizeLocalConnectionUrl(baseUrl);
      await storeLocalConnection(cameraId, normalised, apiKey);
      dispatch({ type: 'restore', payload: { localBaseUrl: normalised, localApiKey: apiKey } });
      consecutiveFailuresRef.current = 0;
      await runProbe(normalised, apiKey);
    },
    [cameraId, runProbe],
  );

  const clearLocalConnection = useCallback(async () => {
    await clearStoredLocalConnection(cameraId);
    dispatch({ type: 'clear' });
    consecutiveFailuresRef.current = 0;
    if (probeIntervalRef.current) {
      clearInterval(probeIntervalRef.current);
      probeIntervalRef.current = null;
    }
  }, [cameraId]);

  // Stable identity while the underlying values are unchanged: consumers use this
  // object as a memo/effect dependency and in reference-equality guards (grid cell
  // effect, effective-connection memo, snapshot dedup), so a fresh literal each
  // render drives an infinite render loop on the cameras screen.
  return useMemo(
    () => ({
      mode,
      localBaseUrl,
      localMediaUrl: deriveLocalMediaUrl(localBaseUrl),
      localApiKey,
      configure,
      clearLocalConnection,
      isInitializing,
    }),
    [mode, localBaseUrl, localApiKey, isInitializing, configure, clearLocalConnection],
  );
}

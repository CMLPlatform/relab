/**
 * Local direct-connection mode for RPi cameras on the same LAN: talk to the
 * Pi's FastAPI (:8018) directly instead of through the backend relay. Preview
 * media is served from that same port (the Pi proxies loopback-only MediaMTX).
 * The Pi's relay connection keeps running, so remote users are unaffected.
 *
 * While the camera is online, the hook fetches the Pi's API key and LAN
 * addresses through the relay (GET /cameras/{id}/local-access), probes each
 * candidate against the unauthenticated `/healthz`, verifies the winner with
 * the device key, and only then persists the URL/key pair. Otherwise it falls
 * back to a stored URL/key or the USB gadget default; `configure()` is manual.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { AppState } from 'react-native';
import { useScreenFocusedSafe } from '@/hooks/useScreenFocused';
import { fetchLocalAccessInfo } from '@/services/api/rpiCamera';
import type { LocalAccessInfo } from '@/services/api/rpiCamera/shared';
import {
  createInitialLocalConnectionState,
  type LocalConnectionMode,
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
  verifyLocalCredentials,
} from './shared';

export interface CameraConnectionInfo {
  mode: LocalConnectionMode;
  localBaseUrl: string | null;
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

// The card grid and the detail screen request the same camera concurrently.
const inFlightAccessInfo = new Map<string, Promise<LocalAccessInfo | null>>();

// Module-level so a disconnect in one hook instance (grid cell) is not undone by
// the bootstrap of another (detail screen). Reset by `configure` and by a reload.
const disconnectedCameras = new Set<string>();

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
  // Bumped on unmount and on an in-place cameraId change; async probes for the
  // previous camera compare against it and bail.
  const generationRef = useRef(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: cameraId is the trigger, not a read — the cleanup has to run when the camera being probed changes, not only on unmount.
  useEffect(() => {
    return () => {
      generationRef.current += 1;
      consecutiveFailuresRef.current = 0;
    };
  }, [cameraId]);

  // Reachability without a key must not promote to 'local': captures would fall
  // back to the relay while the UI claims "direct".
  const runProbe = useCallback(async (url: string, apiKey: string | null) => {
    const generation = generationRef.current;
    const ok = await probeLocalUrl(url);
    if (generation !== generationRef.current) return;

    if (ok) {
      consecutiveFailuresRef.current = 0;
      dispatch({ type: 'setMode', payload: apiKey ? 'local' : 'relay' });
      return;
    }
    consecutiveFailuresRef.current += 1;
    if (consecutiveFailuresRef.current >= MAX_FAILURES_BEFORE_RELAY) {
      dispatch({ type: 'setMode', payload: 'relay' });
    }
  }, []);

  // ── Initialization: restore stored connection, else try the USB gadget ──
  useEffect(() => {
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
      } else if (restoredApiKey) {
        // The USB gadget address is shared by every camera; never bind it
        // without a verified key.
        const ok = await probeLocalUrl(USB_GADGET_DEFAULT);
        if (!cancelled) {
          if (ok) {
            dispatch({
              type: 'restore',
              payload: { localBaseUrl: USB_GADGET_DEFAULT, localApiKey: restoredApiKey },
            });
            dispatch({ type: 'setMode', payload: 'local' });
          } else {
            dispatch({ type: 'setMode', payload: 'relay' });
          }
        }
      } else if (!cancelled) {
        dispatch({ type: 'setMode', payload: 'relay' });
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
  // Keyed on (camera, online) only. `mode` goes through a ref so the 'relay'
  // that `clear` dispatches cannot restart discovery and re-persist what the
  // user just disconnected.
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    if (!isOnline || modeRef.current === 'local' || disconnectedCameras.has(cameraId)) return;
    let cancelled = false;

    async function bootstrapFromRelay() {
      const info = await fetchLocalAccessInfoShared(cameraId);
      if (cancelled || !info?.local_api_key) return;

      const candidates = buildLocalProbeCandidates(info.candidate_urls);
      const reachableUrl = await probeAll(candidates);
      if (cancelled || !reachableUrl || disconnectedCameras.has(cameraId)) return;

      const generation = generationRef.current;
      const normalised = normalizeLocalConnectionUrl(reachableUrl);
      // `/healthz` carries no camera identity, so the reachable host may be a
      // different Pi. An accepted authenticated request is the only proof;
      // without it camera B could persist camera A's URL and send B's key to A.
      // NOTE: only the probe winner is verified; a wrong Pi winning the race
      // means no direct mode this round, not a wrong binding.
      if (!(await verifyLocalCredentials(normalised, info.local_api_key))) return;
      if (cancelled || disconnectedCameras.has(cameraId)) return;
      await storeLocalConnection(cameraId, normalised, info.local_api_key);
      // The other mounted instance may have disconnected during the write.
      if (disconnectedCameras.has(cameraId)) {
        await clearStoredLocalConnection(cameraId);
        return;
      }
      if (cancelled || generation !== generationRef.current) return;
      consecutiveFailuresRef.current = 0;
      dispatch({
        type: 'activate',
        payload: { localBaseUrl: normalised, localApiKey: info.local_api_key },
      });
    }

    bootstrapFromRelay().catch(() => {
      // Discovery is best-effort; the relay transport stays available.
    });
    return () => {
      cancelled = true;
    };
  }, [cameraId, isOnline]);

  // ── Periodic re-probe while a local URL is configured ──
  // Keeps running after a relay fallback: a later successful probe promotes the
  // camera back to direct mode. Paused while backgrounded or unfocused.
  // `useScreenFocusedSafe` returns true off-navigator (CameraPickerDialog).
  const isScreenFocused = useScreenFocusedSafe();
  useEffect(() => {
    if (!localBaseUrl || !isScreenFocused) return;

    let interval: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      interval ??= setInterval(() => {
        void runProbe(localBaseUrl, localApiKey);
      }, PROBE_INTERVAL_ACTIVE_MS);
    };
    const stop = () => {
      if (interval) clearInterval(interval);
      interval = null;
    };

    start();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        stop();
        return;
      }
      void runProbe(localBaseUrl, localApiKey); // catch up on the LAN state we missed
      start();
    });

    return () => {
      stop();
      subscription.remove();
    };
  }, [localBaseUrl, localApiKey, runProbe, isScreenFocused]);

  // ── Manual configuration ──
  const configure = useCallback(
    async (baseUrl: string, apiKey: string) => {
      // Throws for a non-LAN address. Verify the key before persisting it.
      const normalised = normalizeLocalConnectionUrl(baseUrl);
      if (!(await verifyLocalCredentials(normalised, apiKey))) {
        throw new Error('Could not reach the camera at that address with that key.');
      }
      disconnectedCameras.delete(cameraId);
      await storeLocalConnection(cameraId, normalised, apiKey);
      consecutiveFailuresRef.current = 0;
      dispatch({ type: 'activate', payload: { localBaseUrl: normalised, localApiKey: apiKey } });
    },
    [cameraId],
  );

  const clearLocalConnection = useCallback(async () => {
    disconnectedCameras.add(cameraId);
    await clearStoredLocalConnection(cameraId);
    consecutiveFailuresRef.current = 0;
    // Clearing localBaseUrl stops the re-probe interval via its own cleanup.
    dispatch({ type: 'clear' });
  }, [cameraId]);

  // Consumers use this object in effect deps and reference-equality guards; a
  // fresh literal each render loops the cameras screen.
  return useMemo(
    () => ({
      mode,
      localBaseUrl,
      localApiKey,
      configure,
      clearLocalConnection,
      isInitializing,
    }),
    [mode, localBaseUrl, localApiKey, isInitializing, configure, clearLocalConnection],
  );
}

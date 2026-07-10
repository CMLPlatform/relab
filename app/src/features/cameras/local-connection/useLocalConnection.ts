/**
 * Local direct-connection mode for RPi cameras.
 *
 * When a camera is physically connected to the same machine via Ethernet or a
 * USB-C to Ethernet adapter, the frontend can bypass the backend WebSocket relay
 * and talk directly to the Pi's FastAPI (:8018). Preview media is served from
 * that same port (the Pi proxies MediaMTX, which binds to loopback only).
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
 * candidate URL in parallel against the Pi's unauthenticated `/healthz`; the
 * first that identifies itself as an RPi cam activates local mode automatically
 * — no manual key copying required, and the key is never sent to a candidate.
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

// The card grid and the detail screen can request the same camera's access
// info concurrently; share the in-flight relay round-trip between them.
const inFlightAccessInfo = new Map<string, Promise<LocalAccessInfo | null>>();

// An explicit disconnect has to outlive this hook instance: the grid cell and the
// detail screen both run it for the same camera, so a per-instance flag would let
// one instance's bootstrap re-activate and re-persist what the other just cleared.
// Reset by `configure` (the user opting back in) and by a reload.
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
  // Bumped whenever the identity of what we're probing changes — on unmount, and
  // on an in-place cameraId change (the preview target and the detail screen both
  // swap cameraId without remounting). Async probes started for the previous
  // camera compare against it and bail instead of dispatching into the new one.
  const generationRef = useRef(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: cameraId is the trigger, not a read — the cleanup has to run when the camera being probed changes, not only on unmount.
  useEffect(() => {
    return () => {
      generationRef.current += 1;
      consecutiveFailuresRef.current = 0;
    };
  }, [cameraId]);

  const runProbe = useCallback(async (url: string) => {
    const generation = generationRef.current;
    const ok = await probeLocalUrl(url);
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
        await runProbe(restoredUrl);
      } else {
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
  // Deliberately keyed on (camera, online) only. `mode` is read through a ref so
  // a mode change can neither cancel an in-flight discovery nor start a second
  // one — in particular the 'relay' that `clear` dispatches, which used to
  // rediscover and re-persist the connection the user had just disconnected.
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
      await storeLocalConnection(cameraId, normalised, info.local_api_key);
      // The other mounted instance of this camera may have disconnected while we
      // were writing; undo rather than resurrect what it cleared.
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
      // Discovery is best-effort — a storage or probe failure must not surface as
      // an unhandled rejection. The relay transport stays available either way.
    });
    return () => {
      cancelled = true;
    };
  }, [cameraId, isOnline]);

  // ── Periodic re-probe while a local URL is configured ──
  // Keeps running after a relay fallback on purpose: a later successful probe is
  // what promotes the camera back to direct mode when the LAN link returns.
  //
  // Paused while the app is backgrounded *or* the screen is unfocused — otherwise a
  // hidden tab or a stacked-behind screen keeps hitting a device on the user's LAN.
  // `useScreenFocusedSafe` returns true off-navigator, so the CameraPickerDialog
  // (no enclosing screen) keeps probing as it should.
  const isScreenFocused = useScreenFocusedSafe();
  useEffect(() => {
    if (!localBaseUrl || !isScreenFocused) return;

    let interval: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      interval ??= setInterval(() => {
        void runProbe(localBaseUrl);
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
      void runProbe(localBaseUrl); // catch up on the LAN state we missed
      start();
    });

    return () => {
      stop();
      subscription.remove();
    };
  }, [localBaseUrl, runProbe, isScreenFocused]);

  // ── Manual configuration ──
  const configure = useCallback(
    async (baseUrl: string, apiKey: string) => {
      // Throws for a non-LAN address; verify the key before persisting it so a
      // typo can't be reported as a working direct connection.
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

  // Stable identity while the underlying values are unchanged: consumers use this
  // object as a memo/effect dependency and in reference-equality guards (grid cell
  // effect, effective-connection memo, snapshot dedup), so a fresh literal each
  // render drives an infinite render loop on the cameras screen.
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

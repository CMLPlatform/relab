import { fetchWithTimeout } from '@/services/api/request';
import {
  getLocalItem,
  getSecureItem,
  isWeb,
  removeLocalItem,
  removeSecureItem,
  setLocalItem,
  setSecureItem,
} from '@/services/storage';
import { isPrivateLocalHost } from '@/utils/urlSafety';
import { normalizeLocalConnectionUrl } from './reducer';

// Web has no platform-secure storage; keep the API key in memory so XSS can't
// exfiltrate it from localStorage. Lost on reload — user re-enters per session.
const webApiKeys = new Map<string, string>();

export const USB_GADGET_DEFAULT = 'http://192.168.7.1:8018';
export const PROBE_TIMEOUT_MS = 3_000;
export const PROBE_INTERVAL_ACTIVE_MS = 30_000;
export const MAX_FAILURES_BEFORE_RELAY = 2;

export const urlKey = (cameraId: string) => `localConnection:${cameraId}:url`;
export const apiKeySecureKey = (cameraId: string) => `localConnection_${cameraId}_apiKey`;

// The Pi's unauthenticated liveness endpoint. Probing must never carry a credential.
const LIVENESS_PATH = '/healthz';
const RPI_CAM_SERVICE = 'relab-rpi-cam';

export function buildLocalProbeCandidates(candidateUrls: string[]): string[] {
  const localUrls = [...candidateUrls, USB_GADGET_DEFAULT].filter((url) => {
    try {
      return isPrivateLocalHost(new URL(url).hostname);
    } catch {
      return false;
    }
  });
  return [...new Set(localUrls)];
}

// Multiple cards probe the same host concurrently (the USB gadget default).
const inFlightProbes = new Map<string, Promise<boolean>>();

/**
 * Whether an RPi camera is reachable at `baseUrl`. Unauthenticated (no key yet);
 * the service marker keeps an unrelated 200 from winning the probe.
 */
export async function probeLocalUrl(baseUrl: string): Promise<boolean> {
  let probeBaseUrl: string;
  try {
    probeBaseUrl = normalizeLocalConnectionUrl(baseUrl);
  } catch {
    return false;
  }

  const existing = inFlightProbes.get(probeBaseUrl);
  if (existing) return existing;

  const probe = (async () => {
    try {
      const response = await fetchWithTimeout(`${probeBaseUrl}${LIVENESS_PATH}`, {
        headers: { Accept: 'application/json' },
        timeoutMs: PROBE_TIMEOUT_MS,
        redirect: 'error',
      });
      if (!response.ok) return false;
      const body = (await response.json().catch(() => null)) as { service?: unknown } | null;
      return body?.service === RPI_CAM_SERVICE;
    } catch {
      return false;
    } finally {
      inFlightProbes.delete(probeBaseUrl);
    }
  })();
  inFlightProbes.set(probeBaseUrl, probe);
  return probe;
}

export async function probeAll(candidates: string[]): Promise<string | null> {
  if (candidates.length === 0) return null;
  return new Promise((resolve) => {
    let resolved = false;
    let pending = candidates.length;
    for (const url of candidates) {
      void probeLocalUrl(url).then((ok) => {
        pending -= 1;
        if (ok && !resolved) {
          resolved = true;
          resolve(url);
        } else if (pending === 0 && !resolved) {
          resolve(null);
        }
      });
    }
  });
}

/**
 * Whether `apiKey` is accepted by the camera at `baseUrl`. `redirect: 'error'`
 * keeps the key from following a redirect off the LAN host (web only; native
 * fetch ignores it and relies on the private-host gate above).
 */
export async function verifyLocalCredentials(baseUrl: string, apiKey: string): Promise<boolean> {
  try {
    const verifyBaseUrl = normalizeLocalConnectionUrl(baseUrl);
    const response = await fetchWithTimeout(`${verifyBaseUrl}/camera`, {
      headers: { Accept: 'application/json', 'X-API-Key': apiKey },
      timeoutMs: PROBE_TIMEOUT_MS,
      redirect: 'error',
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function storeLocalConnection(cameraId: string, baseUrl: string, apiKey: string) {
  const normalizedBaseUrl = normalizeLocalConnectionUrl(baseUrl);
  if (isWeb()) {
    webApiKeys.set(cameraId, apiKey);
    await setLocalItem(urlKey(cameraId), normalizedBaseUrl);
    return;
  }
  await Promise.all([
    setLocalItem(urlKey(cameraId), normalizedBaseUrl),
    setSecureItem(apiKeySecureKey(cameraId), apiKey),
  ]);
}

export async function loadLocalConnection(cameraId: string) {
  if (isWeb()) {
    const storedUrl = await getLocalItem(urlKey(cameraId));
    return {
      url: storedUrl ?? null,
      apiKey: webApiKeys.get(cameraId) ?? null,
    };
  }
  const [storedUrl, storedKey] = await Promise.all([
    getLocalItem(urlKey(cameraId)),
    getSecureItem(apiKeySecureKey(cameraId)),
  ]);

  return {
    url: storedUrl ?? null,
    apiKey: storedKey ?? null,
  };
}

export async function clearStoredLocalConnection(cameraId: string) {
  if (isWeb()) {
    webApiKeys.delete(cameraId);
    await removeLocalItem(urlKey(cameraId));
    return;
  }
  await Promise.all([
    removeLocalItem(urlKey(cameraId)),
    removeSecureItem(apiKeySecureKey(cameraId)),
  ]);
}

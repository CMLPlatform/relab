import {
  getLocalItem,
  getSecureItem,
  isWeb,
  removeLocalItem,
  removeSecureItem,
  setLocalItem,
  setSecureItem,
} from '@/services/storage';
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

export function deriveMediaUrl(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    url.port = '8888';
    return url.origin;
  } catch {
    return baseUrl.replace(':8018', ':8888');
  }
}

export function buildLocalProbeCandidates(candidateUrls: string[]): string[] {
  return [...candidateUrls, USB_GADGET_DEFAULT].filter(
    (url, index, all) => all.indexOf(url) === index,
  );
}

export async function probeLocalUrl(baseUrl: string, apiKey: string | null): Promise<boolean> {
  let probeBaseUrl: string;
  try {
    probeBaseUrl = normalizeLocalConnectionUrl(baseUrl);
  } catch {
    return false;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (apiKey) headers['X-API-Key'] = apiKey;
    const response = await fetch(`${probeBaseUrl}/camera`, { headers, signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function probeAll(
  candidates: string[],
  apiKey: string | null,
): Promise<string | null> {
  if (candidates.length === 0) return null;
  return new Promise((resolve) => {
    let resolved = false;
    let pending = candidates.length;
    for (const url of candidates) {
      void probeLocalUrl(url, apiKey).then((ok) => {
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

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

// candidate_urls is server-controlled; only probe (and attach the device API key to)
// hosts on the local network so a hostile backend can't turn us into an SSRF/port
// scanner or leak the key to an arbitrary public host.
export function isPrivateLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local')) return true;
  const octets = host.split('.').map(Number);
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = octets;
  return (
    a === 10 ||
    a === 127 ||
    (a === 192 && b === 168) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 169 && b === 254)
  );
}

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

// Multiple cards can probe the same host concurrently (e.g. the USB gadget
// default for every unconfigured camera); share the in-flight request.
const inFlightProbes = new Map<string, Promise<boolean>>();

export async function probeLocalUrl(baseUrl: string, apiKey: string | null): Promise<boolean> {
  let probeBaseUrl: string;
  try {
    probeBaseUrl = normalizeLocalConnectionUrl(baseUrl);
  } catch {
    return false;
  }

  const probeKey = `${probeBaseUrl}|${apiKey ?? ''}`;
  const existing = inFlightProbes.get(probeKey);
  if (existing) return existing;

  const probe = (async () => {
    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (apiKey) headers['X-API-Key'] = apiKey;
      const response = await fetchWithTimeout(`${probeBaseUrl}/camera`, {
        headers,
        timeoutMs: PROBE_TIMEOUT_MS,
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      inFlightProbes.delete(probeKey);
    }
  })();
  inFlightProbes.set(probeKey, probe);
  return probe;
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

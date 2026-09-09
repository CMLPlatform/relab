import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { normalizeLocalConnectionUrl } from '@/features/cameras/local-connection/reducer';
import {
  apiKeySecureKey,
  buildLocalProbeCandidates,
  clearStoredLocalConnection,
  loadLocalConnection,
  probeLocalUrl,
  storeLocalConnection,
  urlKey,
  verifyLocalCredentials,
} from '@/features/cameras/local-connection/shared';

// Stand-ins for the two storage tiers so a test can assert which one a value
// landed in — the whole point of the web/native split below.
const mockLocalStore = new Map<string, string>();
const mockSecureStore = new Map<string, string>();

jest.mock('@/services/storage', () => ({
  isWeb: jest.fn(() => false),
  getLocalItem: jest.fn(async (key: string) => mockLocalStore.get(key) ?? null),
  setLocalItem: jest.fn(async (key: string, value: string) => {
    mockLocalStore.set(key, value);
  }),
  removeLocalItem: jest.fn(async (key: string) => {
    mockLocalStore.delete(key);
  }),
  getSecureItem: jest.fn(async (key: string) => mockSecureStore.get(key) ?? null),
  setSecureItem: jest.fn(async (key: string, value: string) => {
    mockSecureStore.set(key, value);
  }),
  removeSecureItem: jest.fn(async (key: string) => {
    mockSecureStore.delete(key);
  }),
}));

const { isWeb, setSecureItem } = jest.requireMock('@/services/storage') as {
  isWeb: jest.Mock;
  setSecureItem: jest.Mock;
};

const HTTP_URL_ERROR_PATTERN = /http\(s\) URL/;

describe('local connection storage security', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    global.fetch = jest.fn(async () => ({ ok: true })) as unknown as typeof fetch;
  });

  it('normalizes http camera base URLs without trailing slashes', () => {
    expect(normalizeLocalConnectionUrl(' http://192.168.7.1:8018/// ')).toBe(
      'http://192.168.7.1:8018',
    );
  });

  it('rejects non-http camera base URLs', () => {
    expect(() => normalizeLocalConnectionUrl('javascript:alert(1)')).toThrow(
      HTTP_URL_ERROR_PATTERN,
    );
  });

  it('rejects camera base URLs outside the local network', () => {
    // The chokepoint every probe/persist/restore path routes through: a public
    // host must never become a local connection the device key is attached to.
    expect(() => normalizeLocalConnectionUrl('http://evil.example.com')).toThrow(
      HTTP_URL_ERROR_PATTERN,
    );
    expect(() => normalizeLocalConnectionUrl('http://8.8.8.8:8018')).toThrow(
      HTTP_URL_ERROR_PATTERN,
    );
  });

  it('does not probe non-http camera URLs', async () => {
    await expect(probeLocalUrl('file:///tmp/camera')).resolves.toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('does not probe a host outside the local network', async () => {
    await expect(probeLocalUrl('http://evil.example.com:8018')).resolves.toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('probes the unauthenticated liveness endpoint and sends no credential', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({ status: 'ok', service: 'relab-rpi-cam' }),
    }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(probeLocalUrl('http://192.168.7.1:8018')).resolves.toBe(true);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://192.168.7.1:8018/healthz');
    expect(JSON.stringify(init.headers)).not.toContain('X-API-Key');
  });

  it('rejects a local host that answers 200 but is not an RPi camera', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ service: 'some-other-device' }),
    })) as unknown as typeof fetch;

    await expect(probeLocalUrl('http://192.168.1.50:8018')).resolves.toBe(false);
  });

  it('drops server-supplied candidates outside private/link-local ranges', () => {
    const candidates = buildLocalProbeCandidates([
      'http://192.168.1.50:8018',
      'http://10.0.0.5:8018',
      'http://camera.local:8018',
      'http://8.8.8.8:8018', // public IP — must be dropped
      'http://evil.example.com:8018', // public host — must be dropped
    ]);
    expect(candidates).toContain('http://192.168.1.50:8018');
    expect(candidates).toContain('http://10.0.0.5:8018');
    expect(candidates).toContain('http://camera.local:8018');
    expect(candidates).not.toContain('http://8.8.8.8:8018');
    expect(candidates).not.toContain('http://evil.example.com:8018');
  });
});

describe('verifyLocalCredentials', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('sends the API key to the camera and reports acceptance', async () => {
    const fetchMock = jest.fn(async () => ({ ok: true }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(verifyLocalCredentials('http://192.168.7.1:8018/', 'secret-key')).resolves.toBe(
      true,
    );

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://192.168.7.1:8018/camera');
    // `redirect: 'error'` keeps the key from being replayed to a redirect target.
    expect(init.redirect).toBe('error');
    expect(new Headers(init.headers).get('X-API-Key')).toBe('secret-key');
  });

  it('reports a rejected key rather than throwing', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 401 })) as unknown as typeof fetch;

    await expect(verifyLocalCredentials('http://192.168.7.1:8018', 'wrong-key')).resolves.toBe(
      false,
    );
  });

  it('never sends the key to a host outside the local network', async () => {
    global.fetch = jest.fn(async () => ({ ok: true })) as unknown as typeof fetch;

    await expect(verifyLocalCredentials('http://evil.example.com', 'secret-key')).resolves.toBe(
      false,
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('reports an unreachable camera as unverified', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    await expect(verifyLocalCredentials('http://192.168.7.1:8018', 'secret-key')).resolves.toBe(
      false,
    );
  });
});

describe('local connection persistence', () => {
  beforeEach(() => {
    mockLocalStore.clear();
    mockSecureStore.clear();
    jest.clearAllMocks();
  });

  it('keeps the API key in platform-secure storage on native', async () => {
    isWeb.mockReturnValue(false);

    await storeLocalConnection('cam-1', 'http://192.168.7.1:8018/', 'secret-key');

    expect(mockLocalStore.get(urlKey('cam-1'))).toBe('http://192.168.7.1:8018');
    expect(mockSecureStore.get(apiKeySecureKey('cam-1'))).toBe('secret-key');
    await expect(loadLocalConnection('cam-1')).resolves.toEqual({
      url: 'http://192.168.7.1:8018',
      apiKey: 'secret-key',
    });

    await clearStoredLocalConnection('cam-1');
    await expect(loadLocalConnection('cam-1')).resolves.toEqual({ url: null, apiKey: null });
  });

  // Web has no platform-secure store, so the key stays in memory: localStorage
  // is XSS-readable and must never see it.
  it('keeps the API key out of web local storage', async () => {
    isWeb.mockReturnValue(true);

    await storeLocalConnection('cam-1', 'http://192.168.7.1:8018', 'secret-key');

    expect([...mockLocalStore.values()]).not.toContain('secret-key');
    expect(setSecureItem).not.toHaveBeenCalled();
    await expect(loadLocalConnection('cam-1')).resolves.toEqual({
      url: 'http://192.168.7.1:8018',
      apiKey: 'secret-key',
    });

    await clearStoredLocalConnection('cam-1');
    await expect(loadLocalConnection('cam-1')).resolves.toEqual({ url: null, apiKey: null });
  });

  it('refuses to persist a connection to a host outside the local network', async () => {
    isWeb.mockReturnValue(false);

    await expect(
      storeLocalConnection('cam-1', 'http://evil.example.com', 'secret-key'),
    ).rejects.toThrow(HTTP_URL_ERROR_PATTERN);
    expect(mockSecureStore.size).toBe(0);
  });
});

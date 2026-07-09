import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import {
  clearStoredLocalConnection,
  loadLocalConnection,
  probeAll,
  probeLocalUrl,
  storeLocalConnection,
  USB_GADGET_DEFAULT,
  verifyLocalCredentials,
} from '@/features/cameras/local-connection/shared';
import { useLocalConnection } from '@/features/cameras/local-connection/useLocalConnection';
import { fetchLocalAccessInfo } from '@/services/api/rpiCamera';

jest.mock('@/features/cameras/local-connection/shared', () => ({
  __esModule: true,
  USB_GADGET_DEFAULT: 'http://192.168.7.1:8018',
  PROBE_INTERVAL_ACTIVE_MS: 30_000,
  MAX_FAILURES_BEFORE_RELAY: 2,
  buildLocalProbeCandidates: jest.fn((candidateUrls: string[]) =>
    [...candidateUrls, 'http://192.168.7.1:8018'].filter(
      (url, index, all) => all.indexOf(url) === index,
    ),
  ),
  clearStoredLocalConnection: jest.fn(async () => undefined),
  loadLocalConnection: jest.fn(async () => ({ url: null, apiKey: null })),
  probeAll: jest.fn(async () => null),
  probeLocalUrl: jest.fn(async () => false),
  storeLocalConnection: jest.fn(async () => undefined),
  verifyLocalCredentials: jest.fn(async () => true),
}));

jest.mock('@/services/api/rpiCamera', () => ({
  __esModule: true,
  fetchLocalAccessInfo: jest.fn(async () => null),
}));

describe('useLocalConnection', () => {
  async function settleConnectionHook() {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(loadLocalConnection).mockImplementation(async () => ({ url: null, apiKey: null }));
    jest.mocked(probeLocalUrl).mockImplementation(async () => false);
    jest.mocked(probeAll).mockImplementation(async () => null);
    jest.mocked(fetchLocalAccessInfo).mockImplementation(async () => null);
    jest.mocked(storeLocalConnection).mockImplementation(async () => undefined);
    jest.mocked(clearStoredLocalConnection).mockImplementation(async () => undefined);
    jest.mocked(verifyLocalCredentials).mockImplementation(async () => true);
  });

  it('restores a stored connection and switches to local mode when probing succeeds', async () => {
    jest.mocked(loadLocalConnection).mockImplementation(async () => ({
      url: 'http://10.0.0.5:8018',
      apiKey: 'local-key',
    }));
    jest.mocked(probeLocalUrl).mockImplementation(async () => true);

    const { result, unmount } = renderHook(() => useLocalConnection('cam-1'));

    await settleConnectionHook();

    expect(result.current.mode).toBe('local');
    expect(result.current.localBaseUrl).toBe('http://10.0.0.5:8018');
    expect(result.current.localApiKey).toBe('local-key');

    unmount();
  });

  it('falls back to relay mode when no stored URL or USB gadget probe succeeds', async () => {
    const { result, unmount } = renderHook(() => useLocalConnection('cam-1'));

    await settleConnectionHook();

    // Probing is keyless: the app has no device key before it has found a camera.
    expect(probeLocalUrl).toHaveBeenCalledWith(USB_GADGET_DEFAULT);
    expect(result.current.mode).toBe('relay');
    expect(result.current.localBaseUrl).toBeNull();

    unmount();
  });

  it('engages local mode as soon as the USB gadget probe succeeds', async () => {
    jest.mocked(probeLocalUrl).mockImplementation(async () => true);

    const { result, unmount } = renderHook(() => useLocalConnection('cam-usb'));

    await settleConnectionHook();

    // Not 'probing' — a successful probe means the direct link is usable now,
    // rather than 30s later when the re-probe interval next fires.
    expect(result.current.mode).toBe('local');
    expect(result.current.localBaseUrl).toBe(USB_GADGET_DEFAULT);

    unmount();
  });

  it('bootstraps local mode from relay access info when the camera is online', async () => {
    jest.mocked(fetchLocalAccessInfo).mockImplementation(async () => ({
      local_api_key: 'relay-key',
      candidate_urls: ['http://10.0.0.8:8018'],
      mdns_name: null,
    }));
    jest.mocked(probeAll).mockImplementation(async () => 'http://10.0.0.8:8018');

    const { result, unmount } = renderHook(() => useLocalConnection('cam-1', { isOnline: true }));

    await settleConnectionHook();

    expect(fetchLocalAccessInfo).toHaveBeenCalledWith('cam-1');
    expect(storeLocalConnection).toHaveBeenCalledWith('cam-1', 'http://10.0.0.8:8018', 'relay-key');
    expect(result.current.localBaseUrl).toBe('http://10.0.0.8:8018');
    expect(result.current.localApiKey).toBe('relay-key');

    unmount();
  });

  it('configures and probes a manual direct connection immediately', async () => {
    const { result, unmount } = renderHook(() => useLocalConnection('cam-1'));

    await settleConnectionHook();
    jest.mocked(probeLocalUrl).mockImplementation(async () => true);

    await act(async () => {
      await result.current.configure('http://10.0.0.12:8018/', 'manual-key');
    });

    expect(storeLocalConnection).toHaveBeenCalledWith(
      'cam-1',
      'http://10.0.0.12:8018',
      'manual-key',
    );
    expect(result.current.mode).toBe('local');
    expect(result.current.localBaseUrl).toBe('http://10.0.0.12:8018');

    unmount();
  });

  // An explicit disconnect is latched per camera id for the session, so these two
  // tests use ids of their own to stay independent of one another.
  it('clears the stored local connection and returns to relay mode', async () => {
    jest.mocked(loadLocalConnection).mockImplementation(async () => ({
      url: 'http://10.0.0.5:8018',
      apiKey: 'local-key',
    }));
    jest.mocked(probeLocalUrl).mockImplementation(async () => true);

    const { result, unmount } = renderHook(() => useLocalConnection('cam-clear'));

    await settleConnectionHook();

    await act(async () => {
      await result.current.clearLocalConnection();
    });

    expect(clearStoredLocalConnection).toHaveBeenCalledWith('cam-clear');
    expect(result.current.mode).toBe('relay');
    expect(result.current.localBaseUrl).toBeNull();
    expect(result.current.localApiKey).toBeNull();

    unmount();
  });

  it('does not let the relay bootstrap undo an explicit disconnect', async () => {
    // Regression: `clear` sets mode to 'relay', which is a dep of the bootstrap
    // effect — it used to immediately rediscover and re-persist the connection.
    jest.mocked(fetchLocalAccessInfo).mockImplementation(async () => ({
      local_api_key: 'relay-key',
      candidate_urls: ['http://10.0.0.8:8018'],
      mdns_name: null,
    }));
    jest.mocked(probeAll).mockImplementation(async () => 'http://10.0.0.8:8018');

    const { result, unmount } = renderHook(() =>
      useLocalConnection('cam-disconnect', { isOnline: true }),
    );

    await settleConnectionHook();
    expect(result.current.localBaseUrl).toBe('http://10.0.0.8:8018');
    const storesBeforeClear = jest.mocked(storeLocalConnection).mock.calls.length;

    await act(async () => {
      await result.current.clearLocalConnection();
    });
    await settleConnectionHook();

    expect(result.current.mode).toBe('relay');
    expect(result.current.localBaseUrl).toBeNull();
    // The disconnect must not be re-persisted by a rerun of the bootstrap.
    expect(jest.mocked(storeLocalConnection).mock.calls).toHaveLength(storesBeforeClear);

    unmount();
  });

  it('returns a stable object reference across renders while values are unchanged', async () => {
    // Regression: an unstable reference here drove an infinite render loop on the
    // cameras grid (effective-connection memo + cell effect + snapshot dedup all
    // use this object as an identity).
    const { result, rerender, unmount } = renderHook(() => useLocalConnection('cam-1'));

    await settleConnectionHook();
    const first = result.current;
    rerender({});

    expect(result.current).toBe(first);

    unmount();
  });
});

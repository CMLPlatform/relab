import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import {
  clearStoredLocalConnection,
  loadLocalConnection,
  probeAll,
  probeLocalUrl,
  storeLocalConnection,
  USB_GADGET_DEFAULT,
} from '@/hooks/local-connection/shared';
import { useLocalConnection } from '@/hooks/useLocalConnection';
import { fetchLocalAccessInfo } from '@/services/api/rpiCamera';

jest.mock('@/hooks/local-connection/shared', () => ({
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
    expect(result.current.localMediaUrl).toBe('http://10.0.0.5:8888');
    expect(result.current.localApiKey).toBe('local-key');

    unmount();
  });

  it('falls back to relay mode when no stored URL or USB gadget probe succeeds', async () => {
    const { result, unmount } = renderHook(() => useLocalConnection('cam-1'));

    await settleConnectionHook();

    expect(probeLocalUrl).toHaveBeenCalledWith(USB_GADGET_DEFAULT, null);
    expect(result.current.mode).toBe('relay');
    expect(result.current.localBaseUrl).toBeNull();

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

  it('clears the stored local connection and returns to relay mode', async () => {
    jest.mocked(loadLocalConnection).mockImplementation(async () => ({
      url: 'http://10.0.0.5:8018',
      apiKey: 'local-key',
    }));
    jest.mocked(probeLocalUrl).mockImplementation(async () => true);

    const { result, unmount } = renderHook(() => useLocalConnection('cam-1'));

    await settleConnectionHook();

    await act(async () => {
      await result.current.clearLocalConnection();
    });

    expect(clearStoredLocalConnection).toHaveBeenCalledWith('cam-1');
    expect(result.current.mode).toBe('relay');
    expect(result.current.localBaseUrl).toBeNull();
    expect(result.current.localApiKey).toBeNull();

    unmount();
  });
});

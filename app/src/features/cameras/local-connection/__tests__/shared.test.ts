import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { normalizeLocalConnectionUrl } from '@/features/cameras/local-connection/reducer';
import {
  buildLocalProbeCandidates,
  probeLocalUrl,
} from '@/features/cameras/local-connection/shared';

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

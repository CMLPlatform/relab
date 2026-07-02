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

  it('does not probe non-http camera URLs', async () => {
    await expect(probeLocalUrl('file:///tmp/camera', 'secret-key')).resolves.toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
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

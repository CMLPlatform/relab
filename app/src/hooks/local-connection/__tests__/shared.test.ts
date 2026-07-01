import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { normalizeLocalConnectionUrl } from '@/hooks/local-connection/reducer';
import { probeLocalUrl } from '@/hooks/local-connection/shared';

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
});

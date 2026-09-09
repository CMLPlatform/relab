import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { acceptContributorTerms } from '@/services/api/terms';

jest.mock('@/services/api/auth/authentication', () => ({
  fetchWithAuth: jest.fn(),
}));

const { fetchWithAuth } = jest.requireMock('@/services/api/auth/authentication') as {
  fetchWithAuth: jest.Mock<(...args: unknown[]) => Promise<unknown>>;
};

describe('acceptContributorTerms', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // The server stamps the accepted version, so the client must not send one —
  // a body here would let the client claim it accepted terms it never saw.
  it('POSTs to the accept-terms route with no body', async () => {
    fetchWithAuth.mockResolvedValueOnce({ ok: true, status: 204 });

    await expect(acceptContributorTerms()).resolves.toBeUndefined();

    const [url, init] = fetchWithAuth.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe('/v1/users/me/accept-terms');
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
  });

  it('raises the server detail when acceptance is refused', async () => {
    fetchWithAuth.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ detail: 'Terms already accepted.' }),
    });

    await expect(acceptContributorTerms()).rejects.toThrow('Terms already accepted.');
  });
});

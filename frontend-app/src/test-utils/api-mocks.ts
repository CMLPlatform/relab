import { jest } from '@jest/globals';

/**
 * Creates a minimal fetch Response-like mock object.
 *
 * @param status  HTTP status code
 * @param body    Response body (will be JSON-serialized)
 * @param ok      Overrides the default ok flag (status 200-299 → true)
 */
export function mockResponse(status: number, body: unknown, ok?: boolean) {
  return {
    status,
    ok: ok !== undefined ? ok : status >= 200 && status < 300,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

/**
 * Assigns a jest mock to `global.fetch` and returns it so tests can
 * configure resolved values with `.mockResolvedValueOnce()`.
 */
export function setupFetchMock() {
  const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
  global.fetch = fetchMock;
  return fetchMock;
}

/** Minimal user object matching the app's User type. */
export const mockUser = {
  id: 1,
  username: 'testuser',
  email: 'test@example.com',
  isActive: true,
  isVerified: true,
  isSuperuser: false,
};

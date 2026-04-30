import { jest } from '@jest/globals';
import type { User } from '@/types/User';

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
    ok: ok ?? (status >= 200 && status < 300),
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

/** Creates a minimal User object with optional overrides. */
export function mockUser(overrides: Partial<User> = {}): User {
  return {
    id: '1',
    username: 'testuser',
    email: 'test@example.com',
    isActive: true,
    isVerified: true,
    isSuperuser: false,
    oauth_accounts: [],
    preferences: {},
    ...overrides,
  };
}

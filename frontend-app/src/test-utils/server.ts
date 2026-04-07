import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { mockUser } from './api-mocks';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000/api';

/**
 * Default happy-path handlers for the relab API.
 *
 * These provide sensible defaults for integration tests so each test only needs
 * to override the specific endpoint it cares about via `server.use(...)`.
 *
 * For service-layer unit tests that need precise control over status codes or
 * ordered responses, prefer the `setupFetchMock` + `mockResponse` helpers from
 * `@/test-utils`; they give finer-grained per-call control.
 */
export const handlers = [
  http.post(`${API_URL}/auth/login`, () => HttpResponse.json({ access_token: 'test-token' })),
  http.post(`${API_URL}/auth/logout`, () => HttpResponse.json({})),
  http.post(`${API_URL}/auth/refresh`, () =>
    HttpResponse.json({ access_token: 'refreshed-token' }),
  ),
  http.get(`${API_URL}/users/me`, () => {
    const user = mockUser();
    return HttpResponse.json({
      id: user.id,
      email: user.email,
      is_active: user.isActive,
      is_superuser: user.isSuperuser,
      is_verified: user.isVerified,
      username: user.username,
      oauth_accounts: user.oauth_accounts,
    });
  }),
  http.post(`${API_URL}/auth/register`, () => HttpResponse.json({}, { status: 201 })),
  http.get(`${API_URL}/products`, () => HttpResponse.json([])),
  http.get(`${API_URL}/newsletter/me`, () =>
    HttpResponse.json({
      email: 'test@example.com',
      subscribed: false,
      is_confirmed: false,
    }),
  ),
  http.put(`${API_URL}/newsletter/me`, async ({ request }) => {
    const body = (await request.json()) as { subscribed?: boolean };
    return HttpResponse.json({
      email: 'test@example.com',
      subscribed: !!body.subscribed,
      is_confirmed: !!body.subscribed,
    });
  }),
];

/**
 * MSW server for use in Jest tests.
 *
 * Lifecycle wiring (start/reset/close) is handled in jest.setup.ts.
 * Individual tests may override handlers with:
 *
 *   import { server } from '@/test-utils';
 *   server.use(http.get(`${API_URL}/products`, () => HttpResponse.json([...])));
 */
export const server = setupServer(...handlers);

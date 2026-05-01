import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { API_URL } from '@/config';
import { mockUser } from './api-mocks';

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
  http.get(`${API_URL}/profiles/:username`, () => {
    return HttpResponse.json({
      username: 'testuser',
      created_at: new Date().toISOString(),
      product_count: 5,
      total_weight_kg: 10.5,
      image_count: 12,
      top_category: 'Electronics',
    });
  }),
  http.patch(`${API_URL}/users/me`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const user = mockUser();
    return HttpResponse.json({
      id: user.id,
      email: user.email,
      is_active: user.isActive,
      is_superuser: user.isSuperuser,
      is_verified: user.isVerified,
      username: user.username,
      oauth_accounts: user.oauth_accounts,
      ...body,
    });
  }),
  http.post(`${API_URL}/auth/verify`, () => HttpResponse.json({ message: 'Verified' })),
  http.post(`${API_URL}/auth/request-verify-token`, () => HttpResponse.json({ message: 'Sent' })),
  http.delete(`${API_URL}/oauth/:provider/associate`, () =>
    HttpResponse.json({ message: 'Unlinked' }),
  ),
  http.get(`${API_URL}/plugins/rpi-cam/cameras/:cameraId/local-access`, () =>
    HttpResponse.json({
      local_api_key: 'test-local-api-key',
      candidate_urls: ['http://192.168.7.1:8018'],
      mdns_name: null,
    }),
  ),
  http.get('http://192.168.7.1:8018/camera', () => HttpResponse.json({ ok: true })),
  // Handle OAuth authorize redirects used by Expo Auth Session in tests
  http.get(`${API_URL}/oauth/:provider/session/authorize`, async (resolverParams: unknown) => {
    // The resolver param shape can vary between interceptor implementations:
    // - `{ url }` where `url` is a URL instance
    // - `{ request }` where `request.url` is a string
    // Be defensive and try multiple locations to find the request URL.
    const extractUrl = (p: unknown): string | undefined => {
      if (!p || typeof p !== 'object') return;
      const obj = p as Record<string, unknown>;
      const req = obj.request;
      if (req && typeof req === 'object') {
        const reqObj = req as Record<string, unknown>;
        const reqUrl = reqObj.url;
        if (typeof reqUrl === 'string') return reqUrl;
        if (reqUrl && typeof (reqUrl as URL).href === 'string') return (reqUrl as URL).href;
      }
      const url = obj.url;
      if (typeof url === 'string') return url;
      if (url && typeof (url as URL).href === 'string') return (url as URL).href;
      return;
    };

    const urlString = extractUrl(resolverParams) ?? `${API_URL}/`;
    const reqUrl = new URL(urlString);
    const redirect = reqUrl.searchParams.get('redirect_uri') ?? undefined;

    // Return a provider authorization URL the app can open. Tests that need
    // specific behaviour can override this with `server.use(...)`.
    const authorization_url = `https://provider.example.com/oauth?redirect_uri=${encodeURIComponent(
      redirect ?? '',
    )}`;
    return HttpResponse.json({ authorization_url });
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

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
  http.post(`${API_URL}/auth/bearer/login`, () =>
    HttpResponse.json({ access_token: 'test-token', refresh_token: 'test-refresh-token' }),
  ),
  http.post(`${API_URL}/auth/bearer/logout`, () => HttpResponse.json({})),
  http.post(`${API_URL}/auth/bearer/refresh`, () =>
    HttpResponse.json({
      access_token: 'refreshed-token',
      refresh_token: 'refreshed-refresh-token',
    }),
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
      // Required by UserRead. Omitting them left mapApiUserToUser with an undefined
      // mfaEnabled, so MFA-off assertions passed for the wrong reason.
      mfa_enabled: user.mfaEnabled,
      has_usable_password: user.hasUsablePassword,
      // Role and quota mirror the real UserRead: without them mapApiUserToUser
      // falls back to its defaults and a role-gated affordance is never exercised.
      role: user.role,
      terms_acceptance_required: user.termsAcceptanceRequired,
      upload_quota_files: user.uploadQuota.files,
      upload_quota_bytes: user.uploadQuota.bytes,
      upload_file_count: user.uploadQuota.usedFiles,
      upload_total_bytes: user.uploadQuota.usedBytes,
    });
  }),
  http.post(`${API_URL}/auth/register`, () => HttpResponse.json({}, { status: 201 })),
  // Real endpoint returns a fastapi-pagination Page, never a bare array.
  http.get(`${API_URL}/products`, () =>
    HttpResponse.json({ items: [], total: 0, page: 1, size: 50, pages: 0 }),
  ),
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
      mfa_enabled: user.mfaEnabled,
      has_usable_password: user.hasUsablePassword,
      // Role and quota mirror the real UserRead: without them mapApiUserToUser
      // falls back to its defaults and a role-gated affordance is never exercised.
      role: user.role,
      terms_acceptance_required: user.termsAcceptanceRequired,
      upload_quota_files: user.uploadQuota.files,
      upload_quota_bytes: user.uploadQuota.bytes,
      upload_file_count: user.uploadQuota.usedFiles,
      upload_total_bytes: user.uploadQuota.usedBytes,
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
  // RPi local-connection liveness probe (`probeLocalUrl` in
  // src/features/cameras/local-connection/shared.ts). Wildcard origin so any
  // server-supplied candidate URL a test discovers is covered too, not just the
  // USB gadget default. Answers as "no camera" (network error, matching what an
  // unroutable LAN address does in real life) rather than "camera present" —
  // that's the behaviour every existing test already sees today from the probe
  // escaping to a real, unreachable address, so this keeps their semantics
  // unchanged while making it deterministic instead of a live network wait.
  http.get('*/healthz', () => HttpResponse.error()),
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
 *   server.use(
 *     http.get(`${API_URL}/products`, () =>
 *       HttpResponse.json({ items: [...], total: 1, page: 1, size: 50, pages: 1 }),
 *     ),
 *   );
 */
export const server = setupServer(...handlers);

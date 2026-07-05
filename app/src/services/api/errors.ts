/**
 * Shared API error type and response-to-error helper.
 *
 * All API modules throw ApiError for non-ok responses so callers can branch
 * on `status`/`code` instead of parsing message strings.
 */
export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Extract a human-readable message from a parsed FastAPI error body.
 * `detail` may be a string, a FastAPI validation array, or a nested
 * `{ message }` / `{ reason }` object. Returns undefined when nothing usable
 * is present so callers can fall back.
 */
export function parseApiErrorDetail(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === 'string' && detail) return detail;
  if (Array.isArray(detail)) {
    const msg = detail[0]?.msg;
    return typeof msg === 'string' && msg ? msg : undefined;
  }
  if (detail && typeof detail === 'object') {
    const nested = detail as { message?: unknown; reason?: unknown };
    if (typeof nested.message === 'string' && nested.message) return nested.message;
    if (typeof nested.reason === 'string' && nested.reason) return nested.reason;
  }
  return undefined;
}

export async function throwFromResponse(resp: Response, fallback: string): Promise<never> {
  const body = typeof resp.json === 'function' ? await resp.json().catch(() => null) : null;
  const message = parseApiErrorDetail(body) ?? `${fallback} (${resp.status})`;
  const code =
    typeof (body as { code?: unknown } | null)?.code === 'string' ? body.code : undefined;
  throw new ApiError(message, resp.status, code);
}

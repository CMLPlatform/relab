/** All API modules throw ApiError for non-ok responses so callers can branch on `status`/`code`. */
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

/** Message from a FastAPI error body: `detail` may be a string, a validation array, or `{ message }` / `{ reason }`. */
export function parseApiErrorDetail(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === 'string' && detail) return detail;
  if (Array.isArray(detail)) {
    // FastAPI validation errors are `[{ msg }]`, but custom handlers may return
    // a plain string array.
    const first: unknown = detail[0];
    if (typeof first === 'string' && first) return first;
    const msg = (first as { msg?: unknown } | undefined)?.msg;
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

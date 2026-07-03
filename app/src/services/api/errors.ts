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

export async function throwFromResponse(resp: Response, fallback: string): Promise<never> {
  const body = typeof resp.json === 'function' ? await resp.json().catch(() => null) : null;
  const detail = body?.detail;
  // detail is a string, a {message} object, or a FastAPI validation array.
  const message =
    (typeof detail === 'string'
      ? detail
      : Array.isArray(detail)
        ? detail[0]?.msg
        : detail?.message) ?? `${fallback} (${resp.status})`;
  const code = typeof body?.code === 'string' ? body.code : undefined;
  throw new ApiError(message, resp.status, code);
}

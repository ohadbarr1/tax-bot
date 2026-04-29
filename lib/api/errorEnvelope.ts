/**
 * lib/api/errorEnvelope.ts — uniform JSON error envelope.
 *
 * Every API route returns errors in the shape
 *   { error: { code, message, details? } }
 *
 * Hebrew/RTL is primary — `message` is a user-facing Hebrew string suitable
 * to render directly in the chat bubble / toast / dialog. `code` is a stable
 * machine-readable identifier (UPPER_SNAKE) the client can switch on.
 *
 * Helpers cover the HTTP statuses we actually use across the app:
 *   400  invalid input               — INVALID_INPUT
 *   401  unauthenticated             — UNAUTHORIZED
 *   403  forbidden                   — FORBIDDEN
 *   404  not found                   — NOT_FOUND
 *   413  payload too large           — PAYLOAD_TOO_LARGE
 *   429  rate-limit exceeded         — RATE_LIMITED
 *   500  generic internal            — INTERNAL_ERROR
 *   503  upstream/template missing   — SERVICE_UNAVAILABLE
 *
 * Closes audit findings F-1 / F-3 (uniform envelope) and F1.2.* (auth).
 */

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

function envelope(
  code: string,
  message: string,
  details?: unknown,
): ApiErrorEnvelope {
  const out: ApiErrorEnvelope = { error: { code, message } };
  if (details !== undefined) out.error.details = details;
  return out;
}

function jsonResponse(
  status: number,
  body: ApiErrorEnvelope,
  extraHeaders?: Record<string, string>,
): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders,
  };
  return new Response(JSON.stringify(body), { status, headers });
}

// ─── 400 INVALID_INPUT ────────────────────────────────────────────────────────

export function invalidInput(
  message = "הקלט שהתקבל אינו תקין.",
  details?: unknown,
): Response {
  return jsonResponse(400, envelope("INVALID_INPUT", message, details));
}

// ─── 401 UNAUTHORIZED ─────────────────────────────────────────────────────────

export function unauthorized(message = "נדרשת התחברות."): Response {
  return jsonResponse(401, envelope("UNAUTHORIZED", message));
}

// ─── 403 FORBIDDEN ────────────────────────────────────────────────────────────

export function forbidden(message = "אין הרשאה לפעולה זו."): Response {
  return jsonResponse(403, envelope("FORBIDDEN", message));
}

// ─── 404 NOT_FOUND ────────────────────────────────────────────────────────────

export function notFound(message = "לא נמצא."): Response {
  return jsonResponse(404, envelope("NOT_FOUND", message));
}

// ─── 413 PAYLOAD_TOO_LARGE ───────────────────────────────────────────────────

export function payloadTooLarge(
  message = "הקובץ או הבקשה גדולים מדי.",
): Response {
  return jsonResponse(413, envelope("PAYLOAD_TOO_LARGE", message));
}

// ─── 429 RATE_LIMITED ─────────────────────────────────────────────────────────

export interface RateLimitMeta {
  /** Seconds until the next request will be accepted. */
  retryAfterSeconds?: number;
  /** Remaining tokens in the current window. */
  remaining?: number;
  /** Limit (max requests in the window). */
  limit?: number;
  /** Unix-ms timestamp at which the window resets. */
  resetAt?: number;
}

export function rateLimited(
  meta: RateLimitMeta = {},
  message = "יותר מדי בקשות. נסה שוב בעוד רגע.",
): Response {
  const headers: Record<string, string> = {};
  if (meta.retryAfterSeconds != null) {
    headers["Retry-After"] = String(Math.max(1, Math.ceil(meta.retryAfterSeconds)));
  }
  if (meta.remaining != null) headers["X-RateLimit-Remaining"] = String(meta.remaining);
  if (meta.limit != null) headers["X-RateLimit-Limit"] = String(meta.limit);
  if (meta.resetAt != null) headers["X-RateLimit-Reset"] = String(Math.floor(meta.resetAt / 1000));
  return jsonResponse(429, envelope("RATE_LIMITED", message, meta), headers);
}

// ─── 500 INTERNAL_ERROR ───────────────────────────────────────────────────────

export function internalError(
  message = "שגיאה פנימית. נסה שוב מאוחר יותר.",
  details?: unknown,
): Response {
  return jsonResponse(500, envelope("INTERNAL_ERROR", message, details));
}

// ─── 503 SERVICE_UNAVAILABLE ─────────────────────────────────────────────────

export function serviceUnavailable(
  message = "השירות אינו זמין כרגע. נסה שוב מאוחר יותר.",
  code = "SERVICE_UNAVAILABLE",
  details?: unknown,
): Response {
  return jsonResponse(503, envelope(code, message, details));
}

/**
 * Convenience: wrap a `ZodError` (or anything with an `issues` array) as a
 * 400 INVALID_INPUT response. Issue messages are kept opaque — the client
 * surfaces a single Hebrew string, not field-level errors.
 */
export function invalidInputFromZod(
  issues: unknown,
  message = "פורמט הבקשה אינו תקין.",
): Response {
  return invalidInput(message, { issues });
}

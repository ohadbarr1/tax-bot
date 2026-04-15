/**
 * lib/uploadLimits.ts
 *
 * Single source of truth for file upload size limits. Surfaces:
 *   - MAX_UPLOAD_MB            → human number used in UI copy
 *   - MAX_UPLOAD_BYTES         → programmatic check in route handlers
 *   - MAX_UPLOAD_LABEL         → pre-formatted label like "20MB"
 *
 * Keep them here so the Hebrew dropzone label, API size check, and any
 * future server-side middleware can never drift apart.
 */

export const MAX_UPLOAD_MB = 20;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
export const MAX_UPLOAD_LABEL = `${MAX_UPLOAD_MB}MB`;

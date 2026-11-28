export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const POST_ID = /^\d{1,25}$/;
const HANDLE = /^[A-Za-z0-9_]{1,20}$/;

/** Post and account ids are decimal strings, too large for a JavaScript number. */
export function isId(value: unknown): value is string {
  return typeof value === 'string' && POST_ID.test(value);
}

/** An X @handle, without the @. */
export function isHandle(value: unknown): value is string {
  return typeof value === 'string' && HANDLE.test(value);
}

/** The URL's normalised form if it is a well-formed https URL of sane length, else undefined. */
export function httpsUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2048) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

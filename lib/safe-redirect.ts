const PROBE_ORIGIN = "http://bpm.invalid";
const UNSAFE_CHARS = /[\\\u0000-\u001f\u007f]/;
const PROTOCOL_RELATIVE = /^\/[/\\]/;

/**
 * Returns `raw` as a same-origin path (pathname + search + hash), or null.
 *
 * Only relative paths starting with a single "/" are accepted. Rejects
 * absolute and protocol-relative URLs, backslashes (browsers treat "/\\" as
 * "//"), control characters (the URL parser strips tabs/newlines, which can
 * turn "/\t/evil" into "//evil"), and percent-encoded variants of the same.
 */
export function safeRedirectPath(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) return null;
  if (!raw.startsWith("/")) return null;

  let decoded = raw;
  for (let i = 0; i < 3; i++) {
    if (PROTOCOL_RELATIVE.test(decoded) || UNSAFE_CHARS.test(decoded)) return null;
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return null;
    }
    if (next === decoded) break;
    decoded = next;
  }
  if (PROTOCOL_RELATIVE.test(decoded) || UNSAFE_CHARS.test(decoded)) return null;

  let url: URL;
  try {
    url = new URL(raw, PROBE_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== PROBE_ORIGIN) return null;
  return url.pathname + url.search + url.hash;
}

const BASE = import.meta.env.BASE_URL

/** Static public asset that respects the deployment base path. */
export const MASCOT_URL = `${BASE}mascot.jpeg`

/**
 * Resolve a site-relative URL (e.g. /uploads/abc.png) against the deployment
 * base path. Absolute URLs (http:, https:, data:, blob:, //host) pass through.
 */
export function assetUrl(url: string): string {
  if (!url) return url
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url)) return url
  return url.startsWith('/') ? `${BASE}${url.slice(1)}` : `${BASE}${url}`
}

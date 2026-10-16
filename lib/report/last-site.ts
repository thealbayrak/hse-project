/**
 * Remembers the site and area a worker last reported from, so the next report
 * starts with it on top. Read through useSyncExternalStore (null on the server).
 */
const KEY = "sitesafety-last-site";

export interface LastSite {
  siteId: string;
  locationId: string;
}

let cached: LastSite | null | undefined;
const listeners = new Set<() => void>();

export function readLastSite(): LastSite | null {
  if (cached !== undefined) return cached;
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<LastSite>) : null;
    cached = parsed && typeof parsed.siteId === "string" ? { siteId: parsed.siteId, locationId: parsed.locationId ?? "" } : null;
  } catch {
    cached = null;
  }
  return cached;
}

export function serverLastSite(): LastSite | null {
  return null;
}

export function subscribeLastSite(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function rememberLastSite(next: LastSite) {
  cached = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode: nothing to remember between visits.
  }
  listeners.forEach((listener) => listener());
}

const STORAGE_KEY = "sitesafety.device";

/**
 * A random id for this browser. It is sent with an anonymous report only so the
 * server can limit spam from one phone; it says nothing about who the person is.
 */
export function getDeviceId(): string {
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing && existing.length >= 8) return existing;
    const created = crypto.randomUUID();
    window.localStorage.setItem(STORAGE_KEY, created);
    return created;
  } catch {
    // Private mode: a fresh id per page load still counts for the per-network limit.
    return crypto.randomUUID();
  }
}

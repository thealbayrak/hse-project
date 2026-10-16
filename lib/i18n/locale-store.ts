import { STORAGE_KEY, isLocale, localeFromBrowser, type Locale } from "@/lib/i18n/translations";

/**
 * Tiny external store for the UI locale so components can read it with
 * `useSyncExternalStore`: the server snapshot is always "en" (no hydration
 * mismatch) and the browser snapshot comes from localStorage / navigator.
 */
const SERVER_LOCALE: Locale = "en";

let current: Locale | null = null;
const listeners = new Set<() => void>();

function readInitial(): Locale {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // Storage can be unavailable in private mode; fall back to the browser language.
  }
  return localeFromBrowser(navigator.language);
}

export function getLocaleSnapshot(): Locale {
  if (current === null) current = readInitial();
  return current;
}

export function getServerLocaleSnapshot(): Locale {
  return SERVER_LOCALE;
}

export function subscribeLocale(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setStoredLocale(next: Locale) {
  if (current === next) return;
  current = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Ignore storage failures; the in-memory value still drives the UI.
  }
  listeners.forEach((listener) => listener());
}

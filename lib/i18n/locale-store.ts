import { STORAGE_KEY, isLocale, localeFromBrowser, type Locale } from "@/lib/i18n/translations";

/**
 * Tiny external store for the UI locale so components can read it with
 * `useSyncExternalStore`. The chosen locale is kept in localStorage *and* a
 * cookie: the cookie lets the server render the right language on the first
 * paint (see app/layout.tsx), which keeps hydration mismatch-free even for
 * lazily hydrated Suspense boundaries.
 */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

let current: Locale | null = null;
const listeners = new Set<() => void>();

function readCookie(): Locale | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${STORAGE_KEY}=(en|sv)`));
  return match && isLocale(match[1]) ? match[1] : null;
}

function readInitial(): Locale {
  const fromCookie = readCookie();
  if (fromCookie) return fromCookie;
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
    // Ignore storage failures; the cookie and in-memory value still drive the UI.
  }
  document.cookie = `${STORAGE_KEY}=${next}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
  listeners.forEach((listener) => listener());
}

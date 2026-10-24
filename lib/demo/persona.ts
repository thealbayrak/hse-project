import { DEMO_PERSONA_IDS, type DemoPersonaId } from "@/lib/demo/people";

/**
 * Who the demo is being viewed as. Kept in sessionStorage and read through
 * useSyncExternalStore, so the choice survives a reload but not a new tab.
 */
const KEY = "sitesafety-demo-persona";
export const DEFAULT_PERSONA: DemoPersonaId = "p-owner";

let cached: DemoPersonaId | undefined;
const listeners = new Set<() => void>();

function isPersona(value: unknown): value is DemoPersonaId {
  return typeof value === "string" && (DEMO_PERSONA_IDS as readonly string[]).includes(value);
}

export function readPersona(): DemoPersonaId {
  if (cached !== undefined) return cached;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    cached = isPersona(raw) ? raw : DEFAULT_PERSONA;
  } catch {
    cached = DEFAULT_PERSONA;
  }
  return cached;
}

export function serverPersona(): DemoPersonaId {
  return DEFAULT_PERSONA;
}

export function subscribePersona(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function choosePersona(next: DemoPersonaId) {
  cached = next;
  try {
    window.sessionStorage.setItem(KEY, next);
  } catch {
    // Private mode: the choice lasts until the page is reloaded.
  }
  listeners.forEach((listener) => listener());
}

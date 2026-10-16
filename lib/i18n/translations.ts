import { en, type Messages } from "@/lib/i18n/messages/en";
import { sv } from "@/lib/i18n/messages/sv";
import { tr } from "@/lib/i18n/messages/tr";

export const locales = ["sv", "en", "tr"] as const;
export type Locale = (typeof locales)[number];

export const LOCALE_LABELS: Record<Locale, { short: string; name: string; flag: string }> = {
  sv: { short: "SV", name: "Svenska", flag: "🇸🇪" },
  en: { short: "EN", name: "English", flag: "🇬🇧" },
  tr: { short: "TR", name: "Türkçe", flag: "🇹🇷" },
};

/** BCP 47 tags used for dates, numbers and speech recognition. */
export const LOCALE_TAGS: Record<Locale, string> = {
  sv: "sv-SE",
  en: "en-GB",
  tr: "tr-TR",
};

export const translations: Record<Locale, Messages> = {
  en,
  sv: sv as Messages,
  tr: tr as Messages,
};

export const STORAGE_KEY = "sitesafety-locale";

export function isLocale(value: string | null | undefined): value is Locale {
  return value === "en" || value === "sv" || value === "tr";
}

/**
 * Picks the UI language from a browser language or an Accept-Language header.
 * Swedish is the default for a Swedish work site; English and Turkish are
 * chosen when the device prefers them.
 */
export function localeFromBrowser(language = ""): Locale {
  const tags = language
    .toLowerCase()
    .split(",")
    .map((part) => part.split(";")[0].trim())
    .filter(Boolean);
  for (const tag of tags) {
    if (tag.startsWith("sv")) return "sv";
    if (tag.startsWith("en")) return "en";
    if (tag.startsWith("tr")) return "tr";
  }
  return "sv";
}

type Vars = Record<string, string | number>;

export function translate(locale: Locale, key: string, vars?: Vars): string {
  const [group, field] = splitKey(key);
  const table = translations[locale][group] as Record<string, string> | undefined;
  const fallback = (translations.en[group] as Record<string, string> | undefined)?.[field];
  let value = table?.[field] ?? fallback ?? key;
  if (vars) {
    for (const [name, replacement] of Object.entries(vars)) {
      value = value.replaceAll(`{${name}}`, String(replacement));
    }
  }
  return value;
}

function splitKey(key: string): [keyof Messages, string] {
  const dot = key.indexOf(".");
  if (dot === -1) return ["nav", key];
  return [key.slice(0, dot) as keyof Messages, key.slice(dot + 1)];
}

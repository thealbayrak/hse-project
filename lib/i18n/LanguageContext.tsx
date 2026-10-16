"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { getLocaleSnapshot, setStoredLocale, subscribeLocale } from "@/lib/i18n/locale-store";
import { translate, type Locale } from "@/lib/i18n/translations";

type Vars = Record<string, string | number>;

interface LanguageContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Vars) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({
  initialLocale = "en",
  children,
}: {
  /** Locale the server rendered with (cookie or Accept-Language); see app/layout.tsx. */
  initialLocale?: Locale;
  children: React.ReactNode;
}) {
  const getServerSnapshot = useCallback(() => initialLocale, [initialLocale]);
  const locale = useSyncExternalStore(subscribeLocale, getLocaleSnapshot, getServerSnapshot);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => setStoredLocale(next), []);
  const t = useCallback((key: string, vars?: Vars) => translate(locale, key, vars), [locale]);
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
}

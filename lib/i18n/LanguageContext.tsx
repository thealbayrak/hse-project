"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  STORAGE_KEY,
  isLocale,
  localeFromBrowser,
  translate,
  type Locale,
} from "@/lib/i18n/translations";

type Vars = Record<string, string | number>;

interface LanguageContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Vars) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const next = isLocale(stored) ? stored : localeFromBrowser(navigator.language);
    setLocaleState(next);
    document.documentElement.lang = next;
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.lang = next;
  }, []);

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

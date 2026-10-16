"use client";

import { useLanguage } from "@/lib/i18n/LanguageContext";
import { LOCALE_LABELS, locales } from "@/lib/i18n/translations";
import { cn } from "@/lib/utils";

export function LanguageToggle({ className }: { className?: string }) {
  const { locale, setLocale, t } = useLanguage();

  return (
    <div
      role="group"
      aria-label={t("nav.language")}
      className={cn(
        "inline-flex h-11 shrink-0 items-center rounded-full border border-border bg-secondary/50 p-0.5 text-[11px] font-semibold tracking-wide",
        className
      )}
    >
      {locales.map((code) => {
        const active = locale === code;
        const label = LOCALE_LABELS[code];
        return (
          <button
            key={code}
            type="button"
            onClick={() => setLocale(code)}
            aria-pressed={active}
            aria-label={label.name}
            title={label.name}
            className={cn(
              "min-w-10 rounded-full px-2 py-1.5 transition-colors",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span aria-hidden className="mr-0.5">
              {label.flag}
            </span>
            {label.short}
          </button>
        );
      })}
    </div>
  );
}

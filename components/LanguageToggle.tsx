"use client";

import { useLanguage } from "@/lib/i18n/LanguageContext";
import { cn } from "@/lib/utils";

export function LanguageToggle() {
  const { locale, setLocale } = useLanguage();

  return (
    <div
      role="group"
      aria-label="Language / Språk"
      className="inline-flex h-11 shrink-0 items-center rounded-full border border-border bg-secondary/50 p-0.5 text-[11px] font-semibold tracking-wide"
    >
      <button
        type="button"
        onClick={() => setLocale("sv")}
        className={cn(
          "rounded-full px-2.5 py-1.5",
          locale === "sv" ? "bg-amber-500 text-slate-950" : "text-muted-foreground"
        )}
        aria-pressed={locale === "sv"}
      >
        🇸🇪 SV
      </button>
      <span className="px-0.5 text-muted-foreground/60">|</span>
      <button
        type="button"
        onClick={() => setLocale("en")}
        className={cn(
          "rounded-full px-2.5 py-1.5",
          locale === "en" ? "bg-amber-500 text-slate-950" : "text-muted-foreground"
        )}
        aria-pressed={locale === "en"}
      >
        🇬🇧 EN
      </button>
    </div>
  );
}

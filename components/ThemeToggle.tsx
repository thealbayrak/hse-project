"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { MonitorSmartphoneIcon, MoonIcon, SunIcon } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { cn } from "@/lib/utils";

const ORDER = ["system", "light", "dark"] as const;
type Mode = (typeof ORDER)[number];

const noopSubscribe = () => () => {};
const clientTrue = () => true;
const serverFalse = () => false;

/**
 * Cycles Auto → Light → Dark. Outdoors in bright sun the light theme is far
 * easier to read; indoors and at night the dark theme avoids glare.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const { t } = useLanguage();
  // The stored theme is only known on the client; render the neutral icon until mounted.
  const mounted = useSyncExternalStore(noopSubscribe, clientTrue, serverFalse);
  const mode: Mode = mounted && ORDER.includes(theme as Mode) ? (theme as Mode) : "system";
  const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
  const Icon = mode === "light" ? SunIcon : mode === "dark" ? MoonIcon : MonitorSmartphoneIcon;

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`${t("nav.theme")}: ${t(`theme.${mode}`)}`}
      title={`${t("nav.theme")}: ${t(`theme.${mode}`)}`}
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-secondary/50 text-muted-foreground transition-colors hover:text-foreground",
        className
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}

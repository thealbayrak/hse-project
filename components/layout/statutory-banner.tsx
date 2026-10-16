"use client";

import { TriangleAlertIcon } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { panelClass } from "@/lib/tones";
import { cn } from "@/lib/utils";

export function StatutoryBanner({
  notice = "aml",
  compact = false,
}: {
  notice?: "aml" | "sam";
  compact?: boolean;
}) {
  const { t } = useLanguage();
  const sam = notice === "sam";
  return (
    <div
      role="status"
      className={cn(
        "flex gap-3 rounded-xl border px-4 py-3",
        sam ? panelClass.warning : panelClass.danger,
        compact && "px-3 py-2"
      )}
    >
      <TriangleAlertIcon
        className={cn(
          "mt-0.5 size-5 shrink-0",
          sam ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"
        )}
      />
      <p className={cn("leading-snug font-medium", compact ? "text-xs" : "text-[13px] sm:text-sm")}>
        {t(sam ? "statutory.sam" : "statutory.aml")}
      </p>
    </div>
  );
}

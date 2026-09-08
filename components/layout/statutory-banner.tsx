"use client";

import { TriangleAlertIcon } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { cn } from "@/lib/utils";

export function StatutoryBanner({ notice = "aml" }: { notice?: "aml" | "sam" }) {
  const { t } = useLanguage();
  const sam = notice === "sam";
  return (
    <div
      role="status"
      className={cn(
        "flex gap-3 rounded-xl border px-4 py-3 shadow-[inset_0_0_0_1px_rgba(248,113,113,0.08)]",
        sam
          ? "border-amber-500/40 bg-amber-950/40 text-amber-50"
          : "border-red-500/40 bg-red-950/70 text-red-50"
      )}
    >
      <TriangleAlertIcon
        className={cn("mt-0.5 size-5 shrink-0", sam ? "text-amber-400" : "text-red-400")}
      />
      <p className="text-[13px] leading-snug font-medium sm:text-sm">
        {t(sam ? "statutory.sam" : "statutory.aml")}
      </p>
    </div>
  );
}

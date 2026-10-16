"use client";

import { ClipboardCheckIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { chipClass, panelClass } from "@/lib/tones";
import { cn } from "@/lib/utils";
import type { SafetyWalkSummary } from "@/lib/types";

export function LatestSkyddsrondCard({ walk }: { walk: SafetyWalkSummary | null }) {
  const { locale, t } = useLanguage();
  return (
    <Card className="py-4">
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", chipClass.amber)}>
            <ClipboardCheckIcon className="size-5" />
          </span>
          <div>
            <p className="text-sm text-muted-foreground">{t("dashboard.latestWalk")}</p>
            {walk ? (
              <>
                <p className="mt-1 text-lg font-semibold tracking-tight">
                  {formatDateTime(walk.completedAt, locale)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {walk.skyddsombudName}
                  {walk.skyddsombudRole ? ` · ${walk.skyddsombudRole}` : ""}
                  {walk.siteName ? ` · ${walk.siteName}` : ""}
                </p>
              </>
            ) : (
              <>
                <p className="mt-1 text-lg font-semibold tracking-tight">{t("dashboard.noWalk")}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("dashboard.noWalkHint")}</p>
              </>
            )}
          </div>
        </div>
        {walk && (
          <div className="grid grid-cols-2 gap-3 sm:min-w-[220px]">
            <DeviationStat label={t("dashboard.activeDeviations")} value={walk.activeDeviations} tone="danger" />
            <DeviationStat label={t("dashboard.resolved")} value={walk.resolvedDeviations} tone="success" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DeviationStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "danger" | "success";
}) {
  return (
    <div className={cn("rounded-xl border px-3 py-2", panelClass[tone])}>
      <p className="text-xs opacity-80">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ActivityIcon,
  AlertOctagonIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  DownloadIcon,
  FileSpreadsheetIcon,
  ShieldAlertIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatutoryBanner } from "@/components/layout/statutory-banner";
import { IncidentDetailDialog } from "@/components/dashboard/incident-detail-dialog";
import { LatestSkyddsrondCard } from "@/components/dashboard/latest-skyddsrond-card";
import { SkyddsrondDialog } from "@/components/skyddsrond/skyddsrond-dialog";
import { downloadIncidentsCsv, printIncidentsPdf } from "@/lib/export";
import {
  categoryLabel,
  placeLabel,
  relativeTime,
  severityLabel,
  statusLabel,
  typeLabel,
} from "@/lib/format";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useIncidentStore } from "@/lib/store/incident-store";
import { cn } from "@/lib/utils";
import { severityBarClass, severityClass, statusClass } from "@/lib/tones";
import type { IncidentStatus, Severity } from "@/lib/types";

const STATUS_FILTERS: IncidentStatus[] = ["open", "in-progress", "resolved"];
const SEVERITY_FILTERS: Severity[] = ["critical", "high", "medium", "low"];

export function DashboardView() {
  const { incidents, metrics, loading, error, highlightedIds, latestSafetyWalk } = useIncidentStore();
  const { locale, t } = useLanguage();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<IncidentStatus | "all">("all");
  const [severity, setSeverity] = useState<Severity | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dismissedDeepLink, setDismissedDeepLink] = useState<string | null>(null);
  const [skyddsrondOpen, setSkyddsrondOpen] = useState(false);
  const deepLinkId = searchParams.get("incidentId");

  // `?incidentId=` (from the alert email) opens the incident until the user closes it.
  const activeId = selectedId ?? (deepLinkId && deepLinkId !== dismissedDeepLink ? deepLinkId : null);
  const selected = activeId ? (incidents.find((incident) => incident.id === activeId) ?? null) : null;

  function closeDetail() {
    setSelectedId(null);
    if (deepLinkId) setDismissedDeepLink(deepLinkId);
  }

  const filtered = useMemo(
    () =>
      incidents.filter((incident) => {
        const statusOk = status === "all" || incident.status === status;
        const severityOk = severity === "all" || incident.severity === severity;
        return statusOk && severityOk;
      }),
    [incidents, status, severity]
  );

  function exportCsv() {
    downloadIncidentsCsv(filtered);
    toast.success(t("toast.csvReady"));
  }

  function exportPdf() {
    const opened = printIncidentsPdf(filtered, metrics);
    if (!opened) {
      toast.error(t("toast.pdfBlocked"));
      return;
    }
    toast.success(t("toast.pdfReady"));
  }

  return (
    <div className="space-y-6">
      <StatutoryBanner />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{t("dashboard.samHint")}</p>
        <Button className="h-12 w-full gap-2 sm:w-auto" onClick={() => setSkyddsrondOpen(true)}>
          <ClipboardCheckIcon className="size-4" />
          {t("buttons.conductWalk")}
        </Button>
      </div>
      {error && (
        <p className="rounded-xl border border-amber-500/40 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard
          label={t("dashboard.totalReports")}
          value={metrics.totalReports}
          hint={t("dashboard.totalHint")}
          icon={ClipboardListIcon}
        />
        <MetricCard
          label={t("dashboard.openActions")}
          value={metrics.openActions}
          hint={t("dashboard.openHint")}
          icon={ActivityIcon}
          tone="amber"
        />
        <MetricCard
          label={t("dashboard.criticalNear")}
          value={metrics.criticalNearMisses}
          hint={t("dashboard.criticalHint")}
          icon={AlertOctagonIcon}
          tone="red"
        />
        <MetricCard
          label={t("dashboard.daysFree")}
          value={metrics.daysIncidentFree}
          hint={t("dashboard.daysHint")}
          icon={ShieldAlertIcon}
          tone="emerald"
        />
      </div>

      <LatestSkyddsrondCard walk={latestSafetyWalk} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t("dashboard.feed")}</h2>
          <p className="text-sm text-muted-foreground">
            {loading ? t("dashboard.loading") : t("dashboard.reportsInView", { count: filtered.length })}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button className="h-12" variant="outline" onClick={exportCsv}>
            <FileSpreadsheetIcon className="size-4" />
            {t("buttons.exportCsv")}
          </Button>
          <Button className="h-12" variant="outline" onClick={exportPdf}>
            <DownloadIcon className="size-4" />
            {t("buttons.exportPdf")}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <FilterChip active={status === "all"} onClick={() => setStatus("all")}>
          {t("status.all")}
        </FilterChip>
        {STATUS_FILTERS.map((id) => (
          <FilterChip key={id} active={status === id} onClick={() => setStatus(id)}>
            {statusLabel(id, locale)}
          </FilterChip>
        ))}
        <span className="mx-1 hidden h-8 w-px bg-border sm:block" />
        <FilterChip active={severity === "all"} onClick={() => setSeverity("all")}>
          {t("severity.allLevels")}
        </FilterChip>
        {SEVERITY_FILTERS.map((id) => (
          <FilterChip key={id} active={severity === id} onClick={() => setSeverity(id)}>
            {severityLabel(id, locale)}
          </FilterChip>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map((incident) => (
          <button
            key={incident.id}
            type="button"
            onClick={() => setSelectedId(incident.id)}
            className={cn(
              "flex w-full min-h-[5.5rem] overflow-hidden rounded-2xl border border-border bg-card text-left transition-colors hover:bg-secondary/40",
              highlightedIds.includes(incident.id) && "ring-2 ring-amber-400 ring-offset-2 ring-offset-background"
            )}
          >
            <span className={cn("w-1.5 shrink-0", severityBarClass[incident.severity])} />
            <span className="flex flex-1 flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <span>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-amber-300">{incident.reference}</span>
                  <span className="text-sm font-semibold">{typeLabel(incident.type, locale)}</span>
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {placeLabel(incident)} · {categoryLabel(incident.category, locale)}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium",
                    severityClass[incident.severity]
                  )}
                >
                  {severityLabel(incident.severity, locale)}
                </span>
                <span
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium",
                    statusClass[incident.status]
                  )}
                >
                  {statusLabel(incident.status, locale)}
                </span>
                <span className="text-xs text-muted-foreground">{relativeTime(incident.createdAt, locale)}</span>
              </span>
            </span>
          </button>
        ))}
        {!filtered.length && (
          <Card>
            <CardHeader>
              <CardTitle>{t("dashboard.emptyTitle")}</CardTitle>
              <CardDescription>{t("dashboard.emptyBody")}</CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>

      <IncidentDetailDialog incident={selected} onClose={closeDetail} />
      <SkyddsrondDialog open={skyddsrondOpen} onClose={() => setSkyddsrondOpen(false)} />
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "amber" | "red" | "emerald";
}) {
  return (
    <Card className="py-4">
      <CardContent className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        </div>
        <span
          className={cn(
            "flex size-11 items-center justify-center rounded-xl bg-secondary",
            tone === "amber" && "bg-amber-500/15 text-amber-300",
            tone === "red" && "bg-red-500/15 text-red-300",
            tone === "emerald" && "bg-emerald-500/15 text-emerald-300"
          )}
        >
          <Icon className="size-5" />
        </span>
      </CardContent>
    </Card>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-11 rounded-full border px-4 text-sm font-medium",
        active ? "border-amber-400 bg-amber-500 text-slate-950" : "border-border bg-card text-foreground"
      )}
    >
      {children}
    </button>
  );
}

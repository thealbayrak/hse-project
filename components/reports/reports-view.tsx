"use client";

import { useMemo, useState } from "react";
import { AwardIcon, DownloadIcon, FileSpreadsheetIcon, MedalIcon, TrophyIcon } from "lucide-react";
import { toast } from "sonner";
import { AiReportButton } from "@/components/ai/ai-report-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { downloadIncidentsPdf, downloadIncidentsXlsx } from "@/lib/export";
import { categoryLabel, severityLabel } from "@/lib/format";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { inPeriod, periodFor, summarize, trendBuckets, type Period, type PeriodPreset } from "@/lib/reports/aggregate";
import { useIncidentStore } from "@/lib/store/incident-store";
import { chipClass, panelClass, severityBarClass } from "@/lib/tones";
import { cn } from "@/lib/utils";
import type { Severity } from "@/lib/types";

const PRESETS: Exclude<PeriodPreset, "custom">[] = ["today", "week", "month", "year"];

export function ReportsView() {
  const { locale, t } = useLanguage();
  const { incidents, metrics } = useIncidentStore();
  const [preset, setPreset] = useState<PeriodPreset>("month");
  const [custom, setCustom] = useState<Period>(() => periodFor("month"));

  const period = preset === "custom" ? custom : periodFor(preset);
  const summary = useMemo(() => summarize(incidents, period), [incidents, period]);
  const buckets = useMemo(() => trendBuckets(summary), [summary]);
  const maxBucket = Math.max(1, ...buckets.map((bucket) => bucket.count));
  const inRange = useMemo(() => incidents.filter((incident) => inPeriod(incident.createdAt, period)), [incidents, period]);

  async function exportCsv() {
    try {
      await downloadIncidentsXlsx(inRange, { ...metrics, totalReports: summary.total }, locale);
      toast.success(t("toast.xlsxReady"));
    } catch {
      toast.error(t("toast.exportFailed"));
    }
  }

  async function exportPdf() {
    try {
      await downloadIncidentsPdf(inRange, { ...metrics, totalReports: summary.total }, {
        locale,
        subtitle: `${period.from} – ${period.to}`,
        fileName: `sitesafety-report-${period.from}-${period.to}.pdf`,
      });
      toast.success(t("toast.pdfReady"));
    } catch {
      toast.error(t("toast.exportFailed"));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-[0.16em] text-amber-700 uppercase dark:text-amber-400">{t("roles.officerEyebrow")}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("reports.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("reports.body")}</p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {PRESETS.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={preset === item}
            onClick={() => setPreset(item)}
            className={cn(
              "min-h-11 rounded-full border px-4 text-sm font-medium",
              preset === item ? "border-amber-500 bg-amber-500 text-slate-950" : "border-border bg-card"
            )}
          >
            {t(`reports.${item}`)}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={preset === "custom"}
          onClick={() => setPreset("custom")}
          className={cn(
            "min-h-11 rounded-full border px-4 text-sm font-medium",
            preset === "custom" ? "border-amber-500 bg-amber-500 text-slate-950" : "border-border bg-card"
          )}
        >
          {t("reports.custom")}
        </button>
        {preset === "custom" && (
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor="from" className="text-xs">
                {t("reports.from")}
              </Label>
              <Input id="from" type="date" value={custom.from} max={custom.to} onChange={(event) => setCustom((c) => ({ ...c, from: event.target.value }))} className="h-11" />
            </div>
            <div>
              <Label htmlFor="to" className="text-xs">
                {t("reports.to")}
              </Label>
              <Input id="to" type="date" value={custom.to} min={custom.from} onChange={(event) => setCustom((c) => ({ ...c, to: event.target.value }))} className="h-11" />
            </div>
          </div>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {period.from} → {period.to}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label={t("reports.total")} value={summary.total} />
        <Stat label={t("reports.accidents")} value={summary.byType.accident} tone="red" />
        <Stat label={t("reports.nearMisses")} value={summary.byType["near-miss"]} tone="amber" />
        <Stat label={t("reports.hazards")} value={summary.byType.hazard} tone="sky" />
        <Stat label={t("reports.critical")} value={summary.bySeverity.critical} tone="red" />
        <Stat label={t("reports.resolutionRate")} value={`${Math.round(summary.resolutionRate * 100)}%`} tone="emerald" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-border bg-card p-4 lg:col-span-2">
          <h2 className="text-sm font-semibold">{t("reports.trend")}</h2>
          {summary.total === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">{t("reports.noData")}</p>
          ) : (
            <div className="mt-3 flex h-40 items-end gap-1" role="img" aria-label={t("reports.trend")}>
              {buckets.map((bucket) => (
                <div key={bucket.label} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${bucket.label}: ${bucket.count}`}>
                  <div className="flex w-full flex-col justify-end" style={{ height: `${(bucket.count / maxBucket) * 100}%` }}>
                    <div className="w-full rounded-t bg-red-500" style={{ height: `${bucket.count ? (bucket.critical / bucket.count) * 100 : 0}%` }} />
                    <div className="w-full flex-1 rounded-t bg-amber-500" />
                  </div>
                  <span className="w-full truncate text-center text-[10px] text-muted-foreground">{buckets.length > 16 && buckets.indexOf(bucket) % 2 ? "" : bucket.label}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">{t("reports.bySeverity")}</h2>
          <ul className="mt-3 space-y-2">
            {(["critical", "high", "medium", "low"] as Severity[]).map((severity) => (
              <li key={severity} className="flex items-center gap-3 text-sm">
                <span className={cn("h-3 w-3 shrink-0 rounded-full", severityBarClass[severity])} />
                <span className="flex-1">{severityLabel(severity, locale)}</span>
                <span className="font-semibold">{summary.bySeverity[severity]}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-1 border-t border-border pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("reports.medianClose")}</dt>
              <dd className="font-medium">
                {summary.medianCloseHours === null
                  ? "—"
                  : summary.medianCloseHours >= 48
                    ? t("reports.days", { n: Math.round(summary.medianCloseHours / 24) })
                    : t("reports.hours", { n: Math.round(summary.medianCloseHours) })}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("reports.openOverdue")}</dt>
              <dd className="font-medium">{summary.overdueActions}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("reports.resolved")}</dt>
              <dd className="font-medium">{summary.resolved}</dd>
            </div>
          </dl>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">{t("reports.byCategory")}</h2>
          <Bars items={summary.byCategory.map((item) => ({ label: categoryLabel(item.category, locale), value: item.count }))} empty={t("reports.noData")} />
        </section>
        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">{t("reports.bySite")}</h2>
          <Bars items={summary.bySite.map((item) => ({ label: item.siteName, value: item.count, note: `${item.critical} ${t("reports.critical").toLowerCase()} · ${item.resolved} ${t("reports.resolved").toLowerCase()}` }))} empty={t("reports.noData")} />
        </section>
      </div>

      <section className={cn("rounded-2xl border p-4", panelClass.success)}>
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <TrophyIcon className="size-4" />
          {t("reports.recognition")}
        </h2>
        <p className="mt-1 text-sm opacity-85">{t("reports.recognitionBody")}</p>
        {summary.reporters.length === 0 ? (
          <p className="mt-3 text-sm opacity-80">{t("reports.noData")}</p>
        ) : (
          <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {summary.reporters.slice(0, 9).map((reporter, index) => (
              <li key={reporter.reporterId} className="flex items-center gap-3 rounded-xl bg-background/70 px-3 py-2">
                <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", reporter.badge === "gold" ? chipClass.amber : reporter.badge === "silver" ? chipClass.sky : chipClass.neutral)}>
                  {reporter.badge === "gold" ? <TrophyIcon className="size-4" /> : reporter.badge === "silver" ? <MedalIcon className="size-4" /> : <AwardIcon className="size-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {index + 1}. {reporter.name}
                  </span>
                  <span className="block text-xs opacity-80">
                    {reporter.count} {t("reports.reports")} · {reporter.badge === "gold" ? t("reports.badgeGold") : reporter.badge === "silver" ? t("reports.badgeSilver") : t("reports.badgeBronze")}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
        <p className="mt-3 text-xs opacity-75">
          {summary.anonymous} {t("reports.anonymousReports")}
        </p>
      </section>

      <div className="flex flex-wrap gap-2">
        <AiReportButton incidents={inRange} scope={`${period.from} – ${period.to}`} />
        <Button type="button" variant="outline" className="h-12 gap-2" onClick={() => void exportCsv()} disabled={!inRange.length}>
          <FileSpreadsheetIcon className="size-4" />
          {t("reports.exportCsv")}
        </Button>
        <Button type="button" variant="outline" className="h-12 gap-2" onClick={() => void exportPdf()} disabled={!inRange.length}>
          <DownloadIcon className="size-4" />
          {t("reports.exportPdf")}
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "neutral" }: { label: string; value: number | string; tone?: keyof typeof chipClass }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5">
      <p className="text-xl font-semibold tracking-tight">{value}</p>
      <p className={cn("mt-1 inline-block rounded px-1.5 py-0.5 text-[11px]", chipClass[tone])}>{label}</p>
    </div>
  );
}

function Bars({ items, empty }: { items: { label: string; value: number; note?: string }[]; empty: string }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  if (!items.length) return <p className="mt-3 text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="mt-3 space-y-2">
      {items.map((item) => (
        <li key={item.label} className="text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate">{item.label}</span>
            <span className="font-semibold">{item.value}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-amber-500" style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
          {item.note && <p className="mt-0.5 text-[11px] text-muted-foreground">{item.note}</p>}
        </li>
      ))}
    </ul>
  );
}

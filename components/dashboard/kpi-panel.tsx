"use client";

import { useState } from "react";
import { ClockIcon } from "lucide-react";
import { averageResolutionDays, incidentsBySubcontractor, severityDistribution } from "@/lib/dashboard/kpis";
import { severityLabel } from "@/lib/format";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { severityBarClass } from "@/lib/tones";
import { cn } from "@/lib/utils";
import type { Incident, Severity } from "@/lib/types";

/** Stroke colours match the severity bars used everywhere else (colour is never the only cue: every slice has a label and a count). */
const SLICE_STROKE: Record<Severity, string> = {
  unrated: "text-violet-500",
  low: "text-emerald-500",
  medium: "text-amber-400",
  high: "text-orange-500",
  critical: "text-red-500",
};

const RADIUS = 40;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GAP = 2; // surface gap between slices, in stroke units

/** Three widgets over the reports in view: average resolution time, reports per subcontractor, severity mix. */
export function KpiPanel({ incidents }: { incidents: Incident[] }) {
  const { locale, t } = useLanguage();
  const [hover, setHover] = useState<string | null>(null);
  const average = averageResolutionDays(incidents);
  const bars = incidentsBySubcontractor(incidents);
  const slices = severityDistribution(incidents);
  const maxBar = Math.max(1, ...bars.map((bar) => bar.count));
  const barLabel = (bar: (typeof bars)[number]) => (bar.other ? t("kpi.other") : bar.key || t("kpi.unspecified"));

  // Where each slice starts along the circle (cumulative share of the ones before it).
  const starts = slices.map((_, index) => slices.slice(0, index).reduce((sum, item) => sum + item.share * CIRCUMFERENCE, 0));

  return (
    <section aria-label={t("kpi.title")} className="grid gap-3 lg:grid-cols-3">
      {/* Average resolution time: a single headline number, not a chart */}
      <article className="flex flex-col justify-between rounded-2xl border border-border bg-card p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <ClockIcon className="size-4 text-amber-600 dark:text-amber-400" />
          {t("kpi.avgResolution")}
        </h3>
        <p className="mt-3 text-4xl font-semibold tracking-tight">
          {average === null ? "—" : average}
          {average !== null && <span className="ml-1.5 text-base font-medium text-muted-foreground">{t("kpi.days")}</span>}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">{average === null ? t("kpi.noResolved") : t("kpi.avgHint")}</p>
      </article>

      {/* Reports per subcontractor: one series, so no legend; values are written on the bars */}
      <article className="rounded-2xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">{t("kpi.bySubcontractor")}</h3>
        {bars.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("reports.noData")}</p>
        ) : (
          <ul className="mt-3 space-y-1.5" aria-label={t("kpi.bySubcontractor")}>
            {bars.map((bar) => {
              const key = `sub:${bar.key}:${bar.other ? "o" : ""}`;
              return (
                <li
                  key={key}
                  onMouseEnter={() => setHover(key)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(key)}
                  onBlur={() => setHover(null)}
                  tabIndex={0}
                  title={`${barLabel(bar)}: ${bar.count}`}
                  className={cn("rounded-lg px-1 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-amber-500", hover === key && "bg-secondary/60")}
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate">{barLabel(bar)}</span>
                    <span className="font-semibold tabular-nums">{bar.count}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-r-[4px] bg-secondary/70">
                    <div className="h-full rounded-r-[4px] bg-amber-500" style={{ width: `${(bar.count / maxBar) * 100}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </article>

      {/* Severity mix: donut with the count in the centre and a labelled legend */}
      <article className="rounded-2xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">{t("kpi.severityMix")}</h3>
        {slices.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("reports.noData")}</p>
        ) : (
          <div className="mt-3 flex items-center gap-4">
            <svg
              viewBox="0 0 100 100"
              className="size-28 shrink-0 -rotate-90"
              role="img"
              aria-label={slices.map((slice) => `${severityLabel(slice.severity, locale)}: ${slice.count}`).join(", ")}
            >
              <circle cx="50" cy="50" r={RADIUS} fill="none" strokeWidth="14" className="text-secondary" stroke="currentColor" />
              {slices.map((slice, index) => {
                const length = Math.max(0, slice.share * CIRCUMFERENCE - (slices.length > 1 ? GAP : 0));
                const start = starts[index];
                return (
                  <circle
                    key={slice.severity}
                    cx="50"
                    cy="50"
                    r={RADIUS}
                    fill="none"
                    strokeWidth={hover === `sev:${slice.severity}` ? 17 : 14}
                    stroke="currentColor"
                    className={cn(SLICE_STROKE[slice.severity], "transition-[stroke-width]")}
                    strokeDasharray={`${length} ${CIRCUMFERENCE - length}`}
                    strokeDashoffset={-start}
                    onMouseEnter={() => setHover(`sev:${slice.severity}`)}
                    onMouseLeave={() => setHover(null)}
                  >
                    <title>{`${severityLabel(slice.severity, locale)}: ${slice.count} (${Math.round(slice.share * 100)}%)`}</title>
                  </circle>
                );
              })}
              <text x="50" y="50" textAnchor="middle" dominantBaseline="central" className="rotate-90 origin-center fill-current text-[18px] font-semibold" transform="rotate(90 50 50)">
                {incidents.length}
              </text>
            </svg>
            <ul className="min-w-0 flex-1 space-y-1 text-sm">
              {slices.map((slice) => (
                <li
                  key={slice.severity}
                  onMouseEnter={() => setHover(`sev:${slice.severity}`)}
                  onMouseLeave={() => setHover(null)}
                  className={cn("flex items-center gap-2 rounded-md px-1 py-0.5", hover === `sev:${slice.severity}` && "bg-secondary/60")}
                >
                  <span className={cn("size-3 shrink-0 rounded-full", severityBarClass[slice.severity])} />
                  <span className="min-w-0 flex-1 truncate">{severityLabel(slice.severity, locale)}</span>
                  <span className="font-semibold tabular-nums">{slice.count}</span>
                  <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">{Math.round(slice.share * 100)}%</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </article>
    </section>
  );
}

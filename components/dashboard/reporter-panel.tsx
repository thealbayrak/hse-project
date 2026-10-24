"use client";

import { useState } from "react";
import { UsersIcon } from "lucide-react";
import { reporterStats } from "@/lib/dashboard/reporters";
import { relativeTime, severityLabel } from "@/lib/format";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { severityBarClass } from "@/lib/tones";
import { cn } from "@/lib/utils";
import type { Incident, Severity } from "@/lib/types";

const ORDER: Severity[] = ["critical", "high", "medium", "low", "unrated"];
const COLLAPSED_ROWS = 6;

/** Who reported how much and how serious: a stacked bar per person, values written next to it. */
export function ReporterPanel({ incidents, bare = false }: { incidents: Incident[]; /** Without its own frame, when it sits inside another one. */ bare?: boolean }) {
  const { locale, t } = useLanguage();
  const [showAll, setShowAll] = useState(false);
  const rows = reporterStats(incidents);
  if (!rows.length) return null;
  const max = Math.max(1, ...rows.map((row) => row.count));
  const visible = showAll ? rows : rows.slice(0, COLLAPSED_ROWS);

  return (
    <section aria-label={t("reporters.title")} className={bare ? "p-3" : "rounded-2xl border border-border bg-card p-4"}>
      <div className="flex items-start justify-between gap-3">
        <div>
          {!bare && (
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <UsersIcon className="size-4 text-amber-600 dark:text-amber-400" />
              {t("reporters.title")}
            </h3>
          )}
          <p className="mt-0.5 text-xs text-muted-foreground">{t("reporters.hint")}</p>
        </div>
        <ul className="hidden shrink-0 flex-wrap justify-end gap-x-3 gap-y-1 text-[11px] text-muted-foreground sm:flex" aria-label={t("reporters.legend")}>
          {ORDER.map((level) => (
            <li key={level} className="flex items-center gap-1">
              <span className={cn("size-2.5 rounded-full", severityBarClass[level])} />
              {severityLabel(level, locale)}
            </li>
          ))}
        </ul>
      </div>

      <ul className="mt-3 space-y-2">
        {visible.map((row) => (
          <li key={row.key} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[minmax(0,12rem)_1fr_7rem]">
            <span className="truncate font-medium" title={row.name ?? t("report.anonymousPerson")}>
              {row.name ?? t("reporters.anonymous")}
            </span>
            <span
              className="flex h-3 overflow-hidden rounded-r-[4px] bg-secondary/70"
              style={{ width: `${(row.count / max) * 100}%`, minWidth: "0.75rem" }}
              role="img"
              aria-label={ORDER.filter((level) => row.severity[level] > 0)
                .map((level) => `${severityLabel(level, locale)}: ${row.severity[level]}`)
                .join(", ")}
            >
              {ORDER.filter((level) => row.severity[level] > 0).map((level) => (
                <span
                  key={level}
                  className={cn("h-full border-r-2 border-card last:border-r-0", severityBarClass[level])}
                  style={{ width: `${(row.severity[level] / row.count) * 100}%` }}
                  title={`${severityLabel(level, locale)}: ${row.severity[level]}`}
                />
              ))}
            </span>
            <span className="text-right text-xs text-muted-foreground tabular-nums">
              <strong className="text-sm font-semibold text-foreground">{row.count}</strong> · {relativeTime(row.lastAt, locale)}
            </span>
          </li>
        ))}
      </ul>

      {rows.length > COLLAPSED_ROWS && (
        <button
          type="button"
          onClick={() => setShowAll((current) => !current)}
          className="mt-3 inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-xs font-semibold hover:bg-secondary/60"
        >
          {showAll ? t("reporters.showLess") : t("reporters.showAll", { n: rows.length })}
        </button>
      )}
    </section>
  );
}

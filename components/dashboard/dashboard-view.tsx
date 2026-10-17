"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ActivityIcon,
  AlertOctagonIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  ClipboardPlusIcon,
  DownloadIcon,
  FileSpreadsheetIcon,
  KanbanSquareIcon,
  ListIcon,
  ShieldAlertIcon,
  UserRoundXIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatutoryBanner } from "@/components/layout/statutory-banner";
import { IncidentBoard } from "@/components/dashboard/incident-board";
import { IncidentDetailDialog } from "@/components/dashboard/incident-detail-dialog";
import { LatestSkyddsrondCard } from "@/components/dashboard/latest-skyddsrond-card";
import { SkyddsrondDialog } from "@/components/skyddsrond/skyddsrond-dialog";
import { downloadIncidentsCsv, printIncidentsPdf } from "@/lib/export";
import { categoryLabel, placeLabel, relativeTime, severityLabel, statusLabel, typeLabel } from "@/lib/format";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useIncidentStore } from "@/lib/store/incident-store";
import { cn } from "@/lib/utils";
import { chipClass, panelClass, severityBarClass, statusClass } from "@/lib/tones";
import type { Incident, IncidentStatus, SafetyWalkSummary, Severity } from "@/lib/types";

const STATUS_FILTERS: IncidentStatus[] = ["open", "in-progress", "resolved"];
const SEVERITY_FILTERS: Severity[] = ["critical", "high", "medium", "low"];

type Focus = "overdue" | "unowned" | null;

const DAY_MS = 86_400_000;

/** Today's date in Europe/Stockholm as YYYY-MM-DD (due dates are stored that way). */
function stockholmToday() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(new Date());
}

export function isOverdue(incident: Incident, today = stockholmToday()) {
  return Boolean(incident.capa?.dueDate) && incident.status !== "resolved" && incident.capa!.dueDate < today;
}

export function isUnownedCritical(incident: Incident) {
  return incident.severity === "critical" && incident.status !== "resolved" && !incident.capa?.assigneeName;
}

export function isWalkStale(walk: SafetyWalkSummary | null, now = Date.now()) {
  if (!walk) return true;
  return now - new Date(walk.completedAt).getTime() > 7 * DAY_MS;
}

export function DashboardView() {
  const { incidents, metrics, loading, error, highlightedIds, latestSafetyWalk } = useIncidentStore();
  const { locale, t } = useLanguage();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<IncidentStatus | "all">("all");
  const [severity, setSeverity] = useState<Severity | "all">("all");
  const [focus, setFocus] = useState<Focus>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dismissedDeepLink, setDismissedDeepLink] = useState<string | null>(null);
  const [skyddsrondOpen, setSkyddsrondOpen] = useState(false);
  const [view, setView] = useState<"list" | "board">("list");
  const deepLinkId = searchParams.get("incidentId");

  // `?incidentId=` (from the alert email) opens the incident until the user closes it.
  const activeId = selectedId ?? (deepLinkId && deepLinkId !== dismissedDeepLink ? deepLinkId : null);
  const selected = activeId ? (incidents.find((incident) => incident.id === activeId) ?? null) : null;

  function closeDetail() {
    setSelectedId(null);
    if (deepLinkId) setDismissedDeepLink(deepLinkId);
  }

  const today = stockholmToday();
  const overdue = useMemo(() => incidents.filter((incident) => isOverdue(incident, today)), [incidents, today]);
  const unowned = useMemo(() => incidents.filter(isUnownedCritical), [incidents]);
  const walkStale = isWalkStale(latestSafetyWalk);
  const attentionCount = (overdue.length ? 1 : 0) + (unowned.length ? 1 : 0) + (walkStale ? 1 : 0);

  const filtered = useMemo(
    () =>
      incidents.filter((incident) => {
        if (focus === "overdue" && !isOverdue(incident, today)) return false;
        if (focus === "unowned" && !isUnownedCritical(incident)) return false;
        const statusOk = status === "all" || incident.status === status;
        const severityOk = severity === "all" || incident.severity === severity;
        return statusOk && severityOk;
      }),
    [incidents, status, severity, focus, today]
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

  const showSkeleton = loading && incidents.length === 0;

  return (
    <div className="space-y-6">
      {error && (
        <p className={cn("rounded-xl border px-4 py-3 text-sm", panelClass.warning)}>{error}</p>
      )}

      {/* 1. What needs the officer's attention today */}
      <section
        aria-labelledby="attention-heading"
        className={cn(
          "rounded-2xl border p-4",
          attentionCount ? panelClass.warning : panelClass.success
        )}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="attention-heading" className="text-sm font-semibold tracking-wide uppercase opacity-80">
              {t("dashboard.attentionTitle")}
            </h2>
            {showSkeleton ? (
              <div className="mt-2 h-5 w-48 animate-pulse rounded bg-current/15" />
            ) : attentionCount === 0 ? (
              <p className="mt-1 flex items-center gap-2 text-sm font-medium">
                <CheckCircle2Icon className="size-4" />
                {t("dashboard.allClear")}
              </p>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-2">
                {overdue.length > 0 && (
                  <li>
                    <AttentionChip
                      active={focus === "overdue"}
                      icon={CalendarClockIcon}
                      label={t("dashboard.overdue", { n: overdue.length })}
                      onClick={() => setFocus(focus === "overdue" ? null : "overdue")}
                    />
                  </li>
                )}
                {unowned.length > 0 && (
                  <li>
                    <AttentionChip
                      active={focus === "unowned"}
                      icon={UserRoundXIcon}
                      label={t("dashboard.unownedCritical", { n: unowned.length })}
                      onClick={() => setFocus(focus === "unowned" ? null : "unowned")}
                    />
                  </li>
                )}
                {walkStale && (
                  <li>
                    <AttentionChip
                      icon={ClipboardCheckIcon}
                      label={t("dashboard.staleWalk")}
                      onClick={() => setSkyddsrondOpen(true)}
                    />
                  </li>
                )}
              </ul>
            )}
          </div>
          <Button className="h-12 shrink-0 gap-2" onClick={() => setSkyddsrondOpen(true)}>
            <ClipboardCheckIcon className="size-4" />
            {t("buttons.conductWalk")}
          </Button>
        </div>
      </section>

      {/* 2. Compact metrics */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricTile
          label={t("dashboard.totalReports")}
          value={metrics.totalReports}
          icon={ClipboardListIcon}
          loading={showSkeleton}
        />
        <MetricTile
          label={t("dashboard.openActions")}
          value={metrics.openActions}
          icon={ActivityIcon}
          tone="amber"
          loading={showSkeleton}
        />
        <MetricTile
          label={t("dashboard.criticalNear")}
          value={metrics.criticalNearMisses}
          icon={AlertOctagonIcon}
          tone="red"
          loading={showSkeleton}
        />
        <MetricTile
          label={t("dashboard.daysFree")}
          value={metrics.daysIncidentFree}
          icon={ShieldAlertIcon}
          tone="emerald"
          loading={showSkeleton}
        />
      </div>

      <LatestSkyddsrondCard walk={latestSafetyWalk} />

      {/* 3. Feed */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t("dashboard.feed")}</h2>
          <p className="text-sm text-muted-foreground">
            {loading ? t("dashboard.loading") : t("dashboard.reportsInView", { count: filtered.length })}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <div role="group" aria-label={t("board.view")} className="col-span-2 inline-flex h-12 items-center rounded-lg border border-border bg-secondary/40 p-1 sm:col-span-1">
            {(["list", "board"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={view === mode}
                onClick={() => setView(mode)}
                className={cn(
                  "inline-flex h-full flex-1 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-colors",
                  view === mode ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                )}
              >
                {mode === "list" ? <ListIcon className="size-4" /> : <KanbanSquareIcon className="size-4" />}
                {t(`board.${mode}`)}
              </button>
            ))}
          </div>
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

      {view === "board" && !showSkeleton && (
        <IncidentBoard incidents={filtered} highlightedIds={highlightedIds} onOpen={setSelectedId} />
      )}

      <div className={cn("space-y-2", view === "board" && !showSkeleton && "hidden")}>
        {showSkeleton &&
          [0, 1, 2].map((index) => (
            <div key={index} className="flex h-[4.5rem] overflow-hidden rounded-2xl border border-border bg-card">
              <span className="w-1.5 shrink-0 animate-pulse bg-muted" />
              <div className="flex-1 space-y-2 px-4 py-3">
                <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
                <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}

        {!showSkeleton &&
          filtered.map((incident) => (
            <IncidentRow
              key={incident.id}
              incident={incident}
              highlighted={highlightedIds.includes(incident.id)}
              overdue={isOverdue(incident, today)}
              onClick={() => setSelectedId(incident.id)}
            />
          ))}

        {!showSkeleton && !filtered.length && (
          <Card>
            <CardHeader>
              <CardTitle>{incidents.length ? t("dashboard.emptyTitle") : t("dashboard.emptyFirstTitle")}</CardTitle>
              <CardDescription>
                {incidents.length ? t("dashboard.emptyBody") : t("dashboard.emptyFirstBody")}
              </CardDescription>
            </CardHeader>
            {!incidents.length && (
              <CardContent>
                <Link
                  href="/report"
                  className="inline-flex h-12 items-center gap-2 rounded-lg bg-amber-500 px-4 text-sm font-medium text-slate-950"
                >
                  <ClipboardPlusIcon className="size-4" />
                  {t("buttons.sendTest")}
                </Link>
              </CardContent>
            )}
            {incidents.length > 0 && focus && (
              <CardContent>
                <Button variant="outline" className="h-11" onClick={() => setFocus(null)}>
                  {t("status.all")}
                </Button>
              </CardContent>
            )}
          </Card>
        )}
      </div>

      <StatutoryBanner compact />

      <IncidentDetailDialog incident={selected} onClose={closeDetail} />
      <SkyddsrondDialog open={skyddsrondOpen} onClose={() => setSkyddsrondOpen(false)} />
    </div>
  );
}

function IncidentRow({
  incident,
  highlighted,
  overdue,
  onClick,
}: {
  incident: Incident;
  highlighted: boolean;
  overdue: boolean;
  onClick: () => void;
}) {
  const { locale, t } = useLanguage();
  const owner = incident.capa?.assigneeName;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${incident.reference} ${typeLabel(incident.type, locale)}, ${severityLabel(incident.severity, locale)}`}
      className={cn(
        "flex w-full min-h-[4.5rem] overflow-hidden rounded-2xl border border-border bg-card text-left transition-colors hover:bg-secondary/40",
        highlighted && "ring-2 ring-amber-400 ring-offset-2 ring-offset-background"
      )}
    >
      <span
        className={cn("w-1.5 shrink-0", severityBarClass[incident.severity])}
        title={severityLabel(incident.severity, locale)}
      />
      <span className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-4 py-3">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">
            <span className="mr-2 font-mono text-xs font-normal text-amber-700 dark:text-amber-300">
              {incident.reference}
            </span>
            {typeLabel(incident.type, locale)}
          </span>
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
            {relativeTime(incident.createdAt, locale)}
          </span>
        </span>
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="truncate">
            {placeLabel(incident)} · {categoryLabel(incident.category, locale)}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-2">
            <span
              className={cn(
                "max-w-[9rem] truncate text-xs",
                owner ? "text-foreground" : "font-medium text-amber-700 dark:text-amber-300"
              )}
            >
              {owner ?? t("dashboard.noOwner")}
            </span>
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                overdue ? panelClass.danger : statusClass[incident.status]
              )}
            >
              {overdue ? t("dashboard.dueDate") + " ⚠" : statusLabel(incident.status, locale)}
            </span>
          </span>
        </span>
      </span>
    </button>
  );
}

function AttentionChip({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex min-h-10 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors",
        active
          ? "border-amber-500 bg-amber-500 text-slate-950"
          : "border-current/30 bg-background/60 hover:bg-background"
      )}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}

function MetricTile({
  label,
  value,
  icon: Icon,
  tone = "neutral",
  loading,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone?: keyof typeof chipClass;
  loading: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", chipClass[tone])}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        {loading ? (
          <div className="h-6 w-10 animate-pulse rounded bg-muted" />
        ) : (
          <p className="text-xl leading-none font-semibold tracking-tight">{value}</p>
        )}
        <p className="mt-1 truncate text-[11px] text-muted-foreground">{label}</p>
      </div>
    </div>
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
      aria-pressed={active}
      className={cn(
        "min-h-11 rounded-full border px-4 text-sm font-medium",
        active ? "border-amber-500 bg-amber-500 text-slate-950" : "border-border bg-card text-foreground"
      )}
    >
      {children}
    </button>
  );
}

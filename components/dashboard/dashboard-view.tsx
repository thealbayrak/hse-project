"use client";

import { useEffect, useMemo, useState } from "react";
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
  EyeIcon,
  FileSpreadsheetIcon,
  FilterXIcon,
  KanbanSquareIcon,
  ListIcon,
  ShieldAlertIcon,
  SirenIcon,
  UserRoundXIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatutoryBanner } from "@/components/layout/statutory-banner";
import { AiReportButton } from "@/components/ai/ai-report-dialog";
import { IncidentBoard } from "@/components/dashboard/incident-board";
import { IncidentDetailDialog } from "@/components/dashboard/incident-detail-dialog";
import { LatestSkyddsrondCard } from "@/components/dashboard/latest-skyddsrond-card";
import { SkyddsrondDialog } from "@/components/skyddsrond/skyddsrond-dialog";
import { can } from "@/lib/auth/permissions";
import { RISK_CATEGORIES } from "@/lib/constants";
import { downloadIncidentsPdf, downloadIncidentsXlsx } from "@/lib/export";
import { categoriesLabel, categoryLabel, placeLabel, relativeTime, severityLabel, statusLabel, typeLabel } from "@/lib/format";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { inPeriod } from "@/lib/reports/aggregate";
import { useIncidentStore } from "@/lib/store/incident-store";
import { cn } from "@/lib/utils";
import { chipClass, panelClass, severityBarClass, statusClass } from "@/lib/tones";
import {
  incidentCategories,
  type Audit,
  type Incident,
  type IncidentStatus,
  type IncidentType,
  type RiskCategory,
  type SafetyWalkSummary,
  type Severity,
} from "@/lib/types";

const STATUS_FILTERS: IncidentStatus[] = ["open", "in-progress", "resolved"];
const SEVERITY_FILTERS: Severity[] = ["critical", "high", "medium", "low"];

export type DashboardTab = "observations" | "audits" | "accidents";
const TABS: { id: DashboardTab; icon: typeof EyeIcon }[] = [
  { id: "observations", icon: EyeIcon },
  { id: "audits", icon: ClipboardCheckIcon },
  { id: "accidents", icon: SirenIcon },
];

const OBSERVATION_TYPES: IncidentType[] = ["hazard", "near-miss", "environmental", "good-observation", "positive-observation"];

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

/** Which tab an incident belongs to. Accidents win over source so an injury on a walk is never hidden. */
export function tabOf(incident: Incident): DashboardTab {
  if (incident.type === "accident") return "accidents";
  if (incident.source === "skyddsrond" || incident.source === "audit") return "audits";
  return "observations";
}

export interface FeedFilters {
  statuses: IncidentStatus[];
  severities: Severity[];
  types: IncidentType[];
  categories: RiskCategory[];
  siteIds: string[];
  from: string;
  to: string;
}

const EMPTY_FILTERS: FeedFilters = { statuses: [], severities: [], types: [], categories: [], siteIds: [], from: "", to: "" };

export function matchesFilters(incident: Incident, filters: FeedFilters) {
  if (filters.statuses.length && !filters.statuses.includes(incident.status)) return false;
  if (filters.severities.length && !filters.severities.includes(incident.severity)) return false;
  if (filters.types.length && !filters.types.includes(incident.type)) return false;
  if (filters.siteIds.length && !filters.siteIds.includes(incident.siteId)) return false;
  if (filters.categories.length) {
    const own = incidentCategories(incident);
    if (!filters.categories.some((category) => own.includes(category))) return false;
  }
  if (filters.from || filters.to) {
    if (!inPeriod(incident.createdAt, { from: filters.from || "1970-01-01", to: filters.to || "2999-12-31" })) return false;
  }
  return true;
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function DashboardView() {
  const { incidents, metrics, loading, error, highlightedIds, latestSafetyWalk, sites, role, listAudits } = useIncidentStore();
  const { locale, t } = useLanguage();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<DashboardTab>("observations");
  const [filters, setFilters] = useState<FeedFilters>(EMPTY_FILTERS);
  const [focus, setFocus] = useState<Focus>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dismissedDeepLink, setDismissedDeepLink] = useState<string | null>(null);
  const [skyddsrondOpen, setSkyddsrondOpen] = useState(false);
  const [view, setView] = useState<"list" | "board">("list");
  const [audits, setAudits] = useState<Audit[] | null>(null);
  const deepLinkId = searchParams.get("incidentId");
  const canAudit = can(role, "audits.conduct");

  // `?incidentId=` (from the alert email) opens the incident until the user closes it.
  const activeId = selectedId ?? (deepLinkId && deepLinkId !== dismissedDeepLink ? deepLinkId : null);
  const selected = activeId ? (incidents.find((incident) => incident.id === activeId) ?? null) : null;

  useEffect(() => {
    if (tab !== "audits" || !canAudit) return;
    let cancelled = false;
    listAudits()
      .then((rows) => {
        if (!cancelled) setAudits(rows);
      })
      .catch(() => {
        if (!cancelled) setAudits([]);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, canAudit, listAudits]);

  function closeDetail() {
    setSelectedId(null);
    if (deepLinkId) setDismissedDeepLink(deepLinkId);
  }

  const today = stockholmToday();
  const overdue = useMemo(() => incidents.filter((incident) => isOverdue(incident, today)), [incidents, today]);
  const unowned = useMemo(() => incidents.filter(isUnownedCritical), [incidents]);
  const walkStale = isWalkStale(latestSafetyWalk);
  const attentionCount = (overdue.length ? 1 : 0) + (unowned.length ? 1 : 0) + (walkStale ? 1 : 0);

  const inTab = useMemo(() => incidents.filter((incident) => tabOf(incident) === tab), [incidents, tab]);
  const tabCounts = useMemo(
    () => ({
      observations: incidents.filter((incident) => tabOf(incident) === "observations" && incident.status !== "resolved").length,
      audits: incidents.filter((incident) => tabOf(incident) === "audits" && incident.status !== "resolved").length,
      accidents: incidents.filter((incident) => tabOf(incident) === "accidents" && incident.status !== "resolved").length,
    }),
    [incidents]
  );

  const filtered = useMemo(
    () =>
      inTab.filter((incident) => {
        if (focus === "overdue" && !isOverdue(incident, today)) return false;
        if (focus === "unowned" && !isUnownedCritical(incident)) return false;
        return matchesFilters(incident, filters);
      }),
    [inTab, filters, focus, today]
  );

  const activeFilterCount =
    filters.statuses.length + filters.severities.length + filters.types.length + filters.categories.length + filters.siteIds.length + (filters.from ? 1 : 0) + (filters.to ? 1 : 0);

  // Types offered in the type filter depend on the tab.
  const typeOptions: IncidentType[] = tab === "accidents" ? ["accident"] : tab === "audits" ? ["hazard", "near-miss", "environmental"] : OBSERVATION_TYPES;
  const categoryOptions = useMemo(() => {
    // Built-in risk types first (in their usual order), then each company's own.
    const used = new Set(inTab.flatMap((incident) => incidentCategories(incident)));
    const builtIn = RISK_CATEGORIES.filter((item) => used.has(item.id)).map((item) => item.id as string);
    const own = [...used].filter((value) => !builtIn.includes(value) && value !== "unclassified").sort();
    return [...builtIn, ...own];
  }, [inTab]);

  async function exportXlsx() {
    try {
      await downloadIncidentsXlsx(filtered, metrics, locale);
      toast.success(t("toast.xlsxReady"));
    } catch {
      toast.error(t("toast.exportFailed"));
    }
  }

  async function exportPdf() {
    try {
      await downloadIncidentsPdf(filtered, metrics, { locale, subtitle: t(`dashboard.tab_${tab}`) });
      toast.success(t("toast.pdfReady"));
    } catch {
      toast.error(t("toast.exportFailed"));
    }
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
        <MetricTile label={t("dashboard.totalReports")} value={metrics.totalReports} icon={ClipboardListIcon} loading={showSkeleton} />
        <MetricTile label={t("dashboard.openActions")} value={metrics.openActions} icon={ActivityIcon} tone="amber" loading={showSkeleton} />
        <MetricTile label={t("dashboard.criticalNear")} value={metrics.criticalNearMisses} icon={AlertOctagonIcon} tone="red" loading={showSkeleton} />
        <MetricTile label={t("dashboard.daysFree")} value={metrics.daysIncidentFree} icon={ShieldAlertIcon} tone="emerald" loading={showSkeleton} />
      </div>

      {/* 3. Tabs: observations, walks & audits, accidents */}
      <div role="tablist" aria-label={t("dashboard.tabs")} className="grid grid-cols-3 gap-1 rounded-2xl border border-border bg-secondary/40 p-1">
        {TABS.map((item) => {
          const active = tab === item.id;
          const count = tabCounts[item.id];
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setTab(item.id);
                setFilters((current) => ({ ...current, types: [], categories: [] }));
                setFocus(null);
              }}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-xs font-medium transition-colors sm:flex-row sm:gap-2 sm:text-sm",
                active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <item.icon className="size-4" />
              <span>{t(`dashboard.tab_${item.id}`)}</span>
              {count > 0 && (
                <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", active ? chipClass.amber : "bg-secondary")}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {tab === "audits" && (
        <div className="space-y-3">
          <LatestSkyddsrondCard walk={latestSafetyWalk} />
          {canAudit && <AuditsSummary audits={audits} />}
        </div>
      )}

      {/* 4. Feed header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t(`dashboard.tab_${tab}`)}</h2>
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
          <AiReportButton
            className="col-span-2 sm:col-span-1"
            incidents={filtered}
            scope={[t(`dashboard.tab_${tab}`), filters.from || filters.to ? `${filters.from || "…"} – ${filters.to || "…"}` : null].filter(Boolean).join(" · ")}
          />
          <Button className="h-12" variant="outline" onClick={() => void exportXlsx()} disabled={!filtered.length}>
            <FileSpreadsheetIcon className="size-4" />
            {t("buttons.exportXlsx")}
          </Button>
          <Button className="h-12" variant="outline" onClick={() => void exportPdf()} disabled={!filtered.length}>
            <DownloadIcon className="size-4" />
            {t("buttons.exportPdf")}
          </Button>
        </div>
      </div>

      {/* 5. Multi-select filters */}
      <div className="space-y-3 rounded-2xl border border-border bg-card p-3">
        <FilterRow label={t("dashboard.status")}>
          {STATUS_FILTERS.map((id) => (
            <FilterChip key={id} active={filters.statuses.includes(id)} onClick={() => setFilters((f) => ({ ...f, statuses: toggle(f.statuses, id) }))}>
              {statusLabel(id, locale)}
            </FilterChip>
          ))}
        </FilterRow>
        <FilterRow label={t("dashboard.severityLabel")}>
          {SEVERITY_FILTERS.map((id) => (
            <FilterChip key={id} active={filters.severities.includes(id)} onClick={() => setFilters((f) => ({ ...f, severities: toggle(f.severities, id) }))}>
              {severityLabel(id, locale)}
            </FilterChip>
          ))}
        </FilterRow>
        {typeOptions.length > 1 && (
          <FilterRow label={t("dashboard.filterType")}>
            {typeOptions.map((id) => (
              <FilterChip key={id} active={filters.types.includes(id)} onClick={() => setFilters((f) => ({ ...f, types: toggle(f.types, id) }))}>
                {typeLabel(id, locale)}
              </FilterChip>
            ))}
          </FilterRow>
        )}
        {categoryOptions.length > 0 && (
          <FilterRow label={t("dashboard.filterCategory")}>
            {categoryOptions.map((id) => (
              <FilterChip key={id} active={filters.categories.includes(id)} onClick={() => setFilters((f) => ({ ...f, categories: toggle(f.categories, id) }))}>
                {categoryLabel(id, locale)}
              </FilterChip>
            ))}
          </FilterRow>
        )}
        {sites.length > 1 && (
          <FilterRow label={t("dashboard.filterSite")}>
            {sites.map((site) => (
              <FilterChip key={site.id} active={filters.siteIds.includes(site.id)} onClick={() => setFilters((f) => ({ ...f, siteIds: toggle(f.siteIds, site.id) }))}>
                {site.name}
              </FilterChip>
            ))}
          </FilterRow>
        )}
        <FilterRow label={t("dashboard.filterDate")}>
          <Input type="date" aria-label={t("reports.from")} value={filters.from} max={filters.to || undefined} onChange={(event) => setFilters((f) => ({ ...f, from: event.target.value }))} className="h-11 w-auto" />
          <Input type="date" aria-label={t("reports.to")} value={filters.to} min={filters.from || undefined} onChange={(event) => setFilters((f) => ({ ...f, to: event.target.value }))} className="h-11 w-auto" />
          {activeFilterCount > 0 && (
            <Button type="button" variant="ghost" size="sm" className="h-11 gap-2 text-muted-foreground" onClick={() => setFilters(EMPTY_FILTERS)}>
              <FilterXIcon className="size-4" />
              {t("dashboard.clearFilters", { n: activeFilterCount })}
            </Button>
          )}
        </FilterRow>
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
            {incidents.length > 0 && (focus || activeFilterCount > 0) && (
              <CardContent>
                <Button
                  variant="outline"
                  className="h-11"
                  onClick={() => {
                    setFocus(null);
                    setFilters(EMPTY_FILTERS);
                  }}
                >
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

function AuditsSummary({ audits }: { audits: Audit[] | null }) {
  const { locale, t } = useLanguage();
  const open = (audits ?? []).filter((audit) => audit.status !== "done" && audit.status !== "cancelled");
  const openNc = (audits ?? []).reduce((sum, audit) => sum + audit.openNonConformities, 0);
  return (
    <Card className="py-4">
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", openNc ? chipClass.red : chipClass.emerald)}>
            <ClipboardListIcon className="size-5" />
          </span>
          <div>
            <p className="text-sm text-muted-foreground">{t("audits.dashboardTitle")}</p>
            <p className="mt-1 text-lg font-semibold tracking-tight">
              {audits === null ? "…" : t("audits.dashboardSummary", { open: open.length, nc: openNc })}
            </p>
            {open[0] && (
              <p className="mt-1 text-xs text-muted-foreground">
                {open[0].templateName} · {open[0].assigneeName ?? t("tasks.unassigned")}
                {open[0].dueDate ? ` · ${new Intl.DateTimeFormat(locale === "sv" ? "sv-SE" : locale === "tr" ? "tr-TR" : "en-GB", { dateStyle: "medium" }).format(new Date(`${open[0].dueDate}T12:00:00`))}` : ""}
              </p>
            )}
          </div>
        </div>
        <Link href="/audits" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-medium hover:bg-secondary/60">
          <ClipboardCheckIcon className="size-4" />
          {t("audits.open")}
        </Link>
      </CardContent>
    </Card>
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
  const categories = incidentCategories(incident);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${incident.reference} ${typeLabel(incident.type, locale, incident.typeNote)}, ${severityLabel(incident.severity, locale)}`}
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
            {typeLabel(incident.type, locale, incident.typeNote)}
          </span>
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
            {relativeTime(incident.createdAt, locale)}
          </span>
        </span>
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="truncate">
            {placeLabel(incident)} ·{" "}
            <span className={cn(!categories.length && "font-medium text-amber-700 dark:text-amber-300")}>{categoriesLabel(categories, locale)}</span>
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

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-full text-[11px] font-semibold tracking-wide text-muted-foreground uppercase sm:w-24">{label}</span>
      {children}
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
        "min-h-10 rounded-full border px-3.5 text-sm font-medium",
        active ? "border-amber-500 bg-amber-500 text-slate-950" : "border-border bg-background text-foreground"
      )}
    >
      {children}
    </button>
  );
}

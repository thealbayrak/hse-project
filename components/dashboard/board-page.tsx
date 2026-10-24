"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { IncidentBoard } from "@/components/dashboard/incident-board";
import { IncidentDetailDialog } from "@/components/dashboard/incident-detail-dialog";
import { MultiSelect } from "@/components/ui/multi-select";
import { can } from "@/lib/auth/permissions";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useIncidentStore } from "@/lib/store/incident-store";
import { panelClass } from "@/lib/tones";
import { cn } from "@/lib/utils";

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "min-h-10 rounded-full border px-3.5 text-sm font-medium",
        active ? "border-amber-500 bg-amber-500 text-slate-950" : "border-border bg-card text-foreground"
      )}
    >
      {children}
    </button>
  );
}


/**
 * The Kanban board on its own page: three columns (open / unassigned, in
 * progress, resolved / closed), drag a card to move it, open it to rate,
 * assign an action owner, set a due date and write to the reporter.
 */
export function BoardPage() {
  const { t } = useLanguage();
  const { incidents, highlightedIds, loading, role, profile, sites } = useIncidentStore();
  const searchParams = useSearchParams();
  const deepLinkId = searchParams.get("incidentId");
  const [mine, setMine] = useState(false);
  const [siteIds, setSiteIds] = useState<string[]>([]);
  const [subcontractors, setSubcontractors] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(deepLinkId);

  const subcontractorOptions = useMemo(
    () => [...new Set(incidents.map((incident) => (incident.subcontractor ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [incidents]
  );

  const visible = useMemo(
    () =>
      incidents.filter((incident) => {
        if (mine && (!profile || incident.capa?.assigneeId !== profile.id)) return false;
        if (siteIds.length && !siteIds.includes(incident.siteId)) return false;
        if (subcontractors.length && !subcontractors.includes((incident.subcontractor ?? "").trim())) return false;
        return true;
      }),
    [incidents, mine, profile, siteIds, subcontractors]
  );
  const selected = selectedId ? (incidents.find((incident) => incident.id === selectedId) ?? null) : null;

  if (!can(role, "dashboard.view")) {
    return <p className={cn("rounded-xl border px-4 py-3 text-sm", panelClass.warning)}>{t("auth.body")}</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold tracking-[0.16em] text-amber-700 uppercase dark:text-amber-400">{t("roles.officerEyebrow")}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("board.pageTitle")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("board.pageBody")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Chip active={mine} onClick={() => setMine((value) => !value)}>
          {t("board.mine")}
        </Chip>
        {sites.length > 1 && (
          <MultiSelect label={t("dashboard.filterSite")} options={sites.map((site) => ({ value: site.id, label: site.name }))} selected={siteIds} onChange={setSiteIds} />
        )}
        {subcontractorOptions.length > 0 && (
          <MultiSelect
            label={t("dashboard.filterSubcontractor")}
            options={subcontractorOptions.map((name) => ({ value: name, label: name }))}
            selected={subcontractors}
            onChange={setSubcontractors}
          />
        )}
      </div>

      {loading && incidents.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("dashboard.loading")}</p>
      ) : (
        <IncidentBoard incidents={visible} highlightedIds={highlightedIds} onOpen={setSelectedId} />
      )}

      <IncidentDetailDialog incident={selected} onClose={() => setSelectedId(null)} />
    </div>
  );
}

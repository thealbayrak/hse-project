"use client";

import { useEffect, useMemo, useState } from "react";
import { UsersIcon } from "lucide-react";
import { AssignPanel } from "@/components/roles/assign-panel";
import { EmptyState, ReportCard, RoleHeader } from "@/components/roles/report-card";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/auth/permissions";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { needsActionOwner } from "@/lib/roles/queries";
import { useIncidentStore } from "@/lib/store/incident-store";
import { panelClass } from "@/lib/tones";
import { cn } from "@/lib/utils";

/** The field supervisor's page: only the reports of their own areas, and the people to put on them. */
export function AreaView() {
  const { t } = useLanguage();
  const { incidents, role, profile, sites, listAreaResponsibles } = useIncidentStore();
  const [locationIds, setLocationIds] = useState<string[] | null>(null);
  const [tab, setTab] = useState<"todo" | "all">("todo");
  const [openId, setOpenId] = useState<string | null>(null);
  const allowed = can(role, "area.view");

  useEffect(() => {
    if (!allowed || !profile) return;
    let cancelled = false;
    listAreaResponsibles()
      .then((rows) => {
        if (!cancelled) setLocationIds(rows.filter((row) => row.profileId === profile.id).map((row) => row.locationId));
      })
      .catch(() => {
        if (!cancelled) setLocationIds([]);
      });
    return () => {
      cancelled = true;
    };
  }, [allowed, profile, listAreaResponsibles]);

  const areaNames = useMemo(
    () =>
      sites.flatMap((site) =>
        site.locations.filter((location) => locationIds?.includes(location.id)).map((location) => `${location.name} · ${site.name}`)
      ),
    [sites, locationIds]
  );
  const reports = useMemo(() => incidents.filter((incident) => incident.source !== "skyddsrond"), [incidents]);
  const todo = useMemo(() => reports.filter(needsActionOwner), [reports]);
  const shown = tab === "todo" ? todo : reports;

  if (!allowed) return <p className={cn("rounded-xl border px-4 py-3 text-sm", panelClass.warning)}>{t("flow.notAllowed")}</p>;

  return (
    <div className="space-y-5">
      <RoleHeader eyebrow={t("roleNames.area_responsible")} title={t("flow.areaTitle")} hint={t("flow.areaHint")} />

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <UsersIcon className="size-4 text-amber-600 dark:text-amber-400" />
          {t("flow.yourAreas")}
        </h2>
        {locationIds !== null && areaNames.length === 0 ? (
          <p className={cn("mt-2 rounded-lg border px-3 py-2 text-sm", panelClass.warning)}>{t("flow.noAreas")}</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {areaNames.map((name) => (
              <li key={name} className="rounded-full border border-border bg-secondary/60 px-3 py-1 text-xs font-medium">
                {name}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div role="tablist" className="grid max-w-md grid-cols-2 gap-1 rounded-2xl border border-border bg-secondary/40 p-1">
        {(["todo", "all"] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn("min-h-11 rounded-xl px-3 text-sm font-medium", tab === id ? "bg-card shadow-sm" : "text-muted-foreground")}
          >
            {id === "todo" ? t("flow.toAssign", { n: todo.length }) : t("flow.allReports", { n: reports.length })}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState text={t("flow.nothingHere")} />
      ) : (
        <div className="space-y-3">
          {shown.map((incident) => (
            <ReportCard key={incident.id} incident={incident} badge={needsActionOwner(incident) ? { text: t("flow.needsPeople"), tone: "warning" } : undefined}>
              <Button type="button" variant="outline" className="h-11" onClick={() => setOpenId(openId === incident.id ? null : incident.id)}>
                {openId === incident.id ? t("flow.close") : t("flow.assignPeople")}
              </Button>
              {openId === incident.id && <AssignPanel incident={incident} onSaved={() => setOpenId(null)} />}
            </ReportCard>
          ))}
        </div>
      )}
    </div>
  );
}

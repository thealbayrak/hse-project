"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2Icon } from "lucide-react";
import { ProjectsView } from "@/components/projects/projects-view";
import { can } from "@/lib/auth/permissions";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useIncidentStore } from "@/lib/store/incident-store";
import { panelClass } from "@/lib/tones";
import { cn } from "@/lib/utils";
import type { Organization } from "@/lib/types";

/** The app owner's page: numbers across every company, then the companies, their places, QR codes and managers. */
export function SuperAdminView() {
  const { t } = useLanguage();
  const { incidents, sites, role, listOrganizations } = useIncidentStore();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const allowed = can(role, "projects.manage");

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    listOrganizations()
      .then((rows) => {
        if (!cancelled) setOrganizations(rows);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [allowed, listOrganizations]);

  const rows = useMemo(
    () =>
      organizations.map((organization) => {
        const reports = incidents.filter((incident) => (incident.organizationId ?? sites.find((site) => site.id === incident.siteId)?.organizationId) === organization.id && incident.source !== "skyddsrond");
        return {
          id: organization.id,
          name: organization.name,
          active: organization.active,
          places: sites.filter((site) => site.organizationId === organization.id).length,
          reports: reports.length,
          open: reports.filter((incident) => incident.status !== "resolved").length,
          critical: reports.filter((incident) => incident.severity === "critical" && incident.status !== "resolved").length,
          pending: reports.filter((incident) => incident.severity === "unrated").length,
        };
      }),
    [organizations, incidents, sites]
  );
  const totals = rows.reduce(
    (sum, row) => ({
      companies: sum.companies + (row.active ? 1 : 0),
      places: sum.places + row.places,
      reports: sum.reports + row.reports,
      open: sum.open + row.open,
      critical: sum.critical + row.critical,
    }),
    { companies: 0, places: 0, reports: 0, open: 0, critical: 0 }
  );

  if (!allowed) return <p className={cn("rounded-xl border px-4 py-3 text-sm", panelClass.warning)}>{t("projects.ownerOnly")}</p>;

  const tiles = [
    [t("flow.globalCompanies"), totals.companies],
    [t("flow.globalPlaces"), totals.places],
    [t("flow.globalReports"), totals.reports],
    [t("flow.globalOpen"), totals.open],
    [t("flow.globalCritical"), totals.critical],
  ] as const;

  return (
    <div className="space-y-6">
      <section className="space-y-3" aria-label={t("flow.globalTitle")}>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Building2Icon className="size-5 text-amber-600 dark:text-amber-400" />
          {t("flow.globalTitle")}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {tiles.map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-border bg-card p-3">
              <p className="text-2xl leading-none font-semibold tabular-nums">{value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
        {rows.length > 0 && (
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-secondary/50 text-left text-xs tracking-wide text-muted-foreground uppercase">
                <tr>
                  <th className="px-3 py-2.5">{t("flow.colCompany")}</th>
                  <th className="px-3 py-2.5 text-right">{t("flow.globalPlaces")}</th>
                  <th className="px-3 py-2.5 text-right">{t("flow.globalReports")}</th>
                  <th className="px-3 py-2.5 text-right">{t("flow.globalOpen")}</th>
                  <th className="px-3 py-2.5 text-right">{t("flow.globalCritical")}</th>
                  <th className="px-3 py-2.5 text-right">{t("flow.colPending")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className={cn("border-t border-border", !row.active && "opacity-60")}>
                    <td className="px-3 py-2 font-medium">{row.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.places}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.reports}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.open}</td>
                    <td className={cn("px-3 py-2 text-right tabular-nums", row.critical > 0 && "font-semibold text-red-700 dark:text-red-300")}>{row.critical}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.pending}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <ProjectsView />
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Building2Icon, EyeOffIcon, HardHatIcon, MapPinIcon, PlusIcon, QrCodeIcon, ShieldAlertIcon, UploadIcon, UsersIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ReportQr } from "@/components/qr/report-qr";
import { StaffForm } from "@/components/settings/staff-form";
import { companyBaseUrl, reportUrl } from "@/lib/qr/urls";
import { can } from "@/lib/auth/permissions";
import { RISK_CATEGORIES } from "@/lib/constants";
import { categoryLabel } from "@/lib/format";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useIncidentStore } from "@/lib/store/incident-store";
import { panelClass } from "@/lib/tones";
import { cn } from "@/lib/utils";
import type { AreaResponsible, Organization, Profile, ReportKey, RiskType, Subcontractor } from "@/lib/types";

function errorText(caught: unknown, fallback: string) {
  return (caught as { message?: string })?.message ?? fallback;
}

/** A company manager's control room: places, areas, risk types and people. */
export function SettingsView() {
  const { t, locale } = useLanguage();
  const searchParams = useSearchParams();
  const {
    role,
    profile,
    sites,
    listOrganizations,
    listProfiles,
    listRiskTypes,
    listSubcontractors,
    listReportKeys,
    rotateReportKey,
    listAreaResponsibles,
    setAreaResponsible,
    createSubcontractor,
    removeSubcontractor,
    createRiskType,
    removeRiskType,
    createSite,
    updateSite,
    createLocation,
    removeLocation,
  } = useIncidentStore();
  const allowed = can(role, "settings.manage");
  const isOwner = role === "super_admin";
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [chosenOrg, setChosenOrg] = useState<string>(searchParams.get("org") ?? "");
  const [people, setPeople] = useState<Profile[]>([]);
  const [riskTypes, setRiskTypes] = useState<RiskType[]>([]);
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [newSub, setNewSub] = useState("");
  const [keys, setKeys] = useState<ReportKey[]>([]);
  const [areaOwners, setAreaOwners] = useState<AreaResponsible[]>([]);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const [newSite, setNewSite] = useState({ name: "", city: "" });
  const [newRisk, setNewRisk] = useState("");
  const [newArea, setNewArea] = useState<Record<string, string>>({});

  // A manager works in their own company; the owner picks one.
  const organizationId = isOwner ? chosenOrg || organizations[0]?.id || "" : (profile?.organizationId ?? "");
  const organization = organizations.find((item) => item.id === organizationId);
  const orgSites = sites.filter((site) => site.organizationId === organizationId);

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

  useEffect(() => {
    if (!allowed || !organizationId) return;
    let cancelled = false;
    listAreaResponsibles()
      .then((rows) => {
        if (!cancelled) setAreaOwners(rows);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [allowed, organizationId, listAreaResponsibles]);

  // The QR keys (a new place gets its key from the database, so reload when the list of places changes).
  useEffect(() => {
    if (!allowed || !organizationId) return;
    let cancelled = false;
    listReportKeys()
      .then((rows) => {
        if (!cancelled) setKeys(rows);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [allowed, organizationId, orgSites.length, listReportKeys]);

  useEffect(() => {
    if (!allowed || !organizationId) return;
    let cancelled = false;
    Promise.all([listProfiles(), listRiskTypes(organizationId), listSubcontractors(organizationId)])
      .then(([profiles, risks, subs]) => {
        if (cancelled) return;
        setPeople(profiles.filter((person) => person.organizationId === organizationId));
        setRiskTypes(risks);
        setSubcontractors(subs);
      })
      .catch((caught) => {
        if (!cancelled) toast.error(errorText(caught, t("toast.capaFailed")));
      });
    return () => {
      cancelled = true;
    };
  }, [allowed, organizationId, listProfiles, listRiskTypes, listSubcontractors, t]);

  if (!allowed) {
    return <p className={cn("rounded-xl border px-4 py-3 text-sm", panelClass.warning)}>{t("auth.body")}</p>;
  }

  if (!organizationId) {
    return (
      <div className={cn("rounded-2xl border p-4 text-sm", panelClass.warning)}>
        <p className="font-semibold">{t("settings.noCompanyTitle")}</p>
        <p className="mt-1">{isOwner ? t("settings.noCompanyOwner") : t("settings.noCompanyManager")}</p>
        {isOwner && (
          <Link href="/projects" className="mt-3 inline-flex h-11 items-center rounded-lg bg-amber-500 px-4 font-medium text-slate-950">
            {t("home.projects")}
          </Link>
        )}
      </div>
    );
  }

  const baseUrl = companyBaseUrl(organization?.slug, origin);
  const keyOf = (siteId: string | null) => keys.find((item) => item.organizationId === organizationId && item.siteId === siteId)?.key ?? null;
  async function rotate(scope: { siteId?: string | null; organizationId?: string | null }) {
    await rotateReportKey(scope);
    setKeys(await listReportKeys());
  }

  async function chooseAreaResponsible(locationId: string, profileId: string) {
    try {
      await setAreaResponsible(locationId, profileId || null);
      setAreaOwners((current) => [...current.filter((item) => item.locationId !== locationId), ...(profileId ? [{ locationId, profileId }] : [])]);
      toast.success(t("settings.saved"));
    } catch (caught) {
      toast.error(errorText(caught, t("toast.capaFailed")));
    }
  }

  async function addSubcontractor() {
    const name = newSub.trim();
    if (!name) return;
    try {
      const created = await createSubcontractor(organizationId, name);
      setSubcontractors((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
      setNewSub("");
    } catch (caught) {
      toast.error(errorText(caught, t("toast.capaFailed")));
    }
  }

  async function addSite() {
    if (!newSite.name.trim()) return;
    try {
      await createSite({ organizationId, name: newSite.name, city: newSite.city });
      setNewSite({ name: "", city: "" });
      toast.success(t("settings.saved"));
    } catch (caught) {
      toast.error(errorText(caught, t("toast.capaFailed")));
    }
  }

  async function addArea(siteId: string) {
    const name = (newArea[siteId] ?? "").trim();
    if (!name) return;
    try {
      await createLocation(siteId, name);
      setNewArea((current) => ({ ...current, [siteId]: "" }));
    } catch (caught) {
      toast.error(errorText(caught, t("toast.capaFailed")));
    }
  }

  async function addRisk() {
    const label = newRisk.trim();
    if (!label) return;
    try {
      const created = await createRiskType(organizationId, label);
      setRiskTypes((current) => [...current, created]);
      setNewRisk("");
    } catch (caught) {
      toast.error(errorText(caught, t("toast.capaFailed")));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-amber-700 uppercase dark:text-amber-400">{t("settings.eyebrow")}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("settings.title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("settings.body")}</p>
        </div>
        {isOwner && organizations.length > 0 && (
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            {t("settings.company")}
            <select value={organizationId} onChange={(event) => setChosenOrg(event.target.value)} className="h-12 min-w-56 rounded-lg border border-border bg-background px-3 text-sm text-foreground">
              {organizations.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {organization && (
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
          <Building2Icon className="size-5 text-amber-700 dark:text-amber-300" />
          <div className="min-w-0">
            <p className="font-semibold">{organization.name}</p>
            <p className="text-xs text-muted-foreground">{[organization.industry, organization.organizationNumber].filter(Boolean).join(" · ") || "—"}</p>
          </div>
        </div>
      )}

      {/* Places and their areas */}
      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <MapPinIcon className="size-5" />
          {t("settings.placesTitle")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("settings.placesHint")}</p>
        <div className="space-y-3">
          {orgSites.length === 0 && <p className="text-sm text-muted-foreground">{t("settings.noPlaces")}</p>}
          {orgSites.map((site) => (
            <div key={site.id} className={cn("rounded-xl border border-border p-3", site.active === false && "opacity-60")}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{site.name}</p>
                  {site.city && <p className="text-xs text-muted-foreground">{site.city}</p>}
                </div>
                <Button type="button" variant="ghost" size="sm" className="h-9 gap-1.5 text-muted-foreground" onClick={() => void updateSite(site.id, { active: site.active === false })}>
                  <EyeOffIcon className="size-4" />
                  {site.active === false ? t("audits.activate") : t("settings.hide")}
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {site.locations.map((location) => (
                  <span key={location.id} className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/40 px-2.5 py-1 text-sm">
                    {location.name}
                    <button type="button" aria-label={`× ${location.name}`} onClick={() => void removeLocation(location.id)} className="rounded-full p-0.5 text-muted-foreground hover:text-foreground">
                      <XIcon className="size-3.5" />
                    </button>
                  </span>
                ))}
                {site.locations.length === 0 && <span className="text-xs text-muted-foreground">{t("settings.noAreas")}</span>}
              </div>
              {site.locations.length > 0 && (
                <details className="mt-2 rounded-xl border border-border bg-background/60 px-3 py-2">
                  <summary className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-medium">
                    <UsersIcon className="size-4" />
                    {t("settings.areaResponsibles")}
                  </summary>
                  <p className="pt-2 text-xs text-muted-foreground">{t("settings.areaResponsiblesHint")}</p>
                  <ul className="space-y-2 pt-2">
                    {site.locations.map((location) => (
                      <li key={location.id} className="grid items-center gap-2 sm:grid-cols-[1fr_16rem]">
                        <span className="text-sm">{location.name}</span>
                        <select
                          aria-label={`${t("settings.areaResponsibles")}: ${location.name}`}
                          value={areaOwners.find((item) => item.locationId === location.id)?.profileId ?? ""}
                          onChange={(event) => void chooseAreaResponsible(location.id, event.target.value)}
                          className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
                        >
                          <option value="">{t("flow.notAssigned")}</option>
                          {people
                            .filter((person) => person.active && ["area_responsible", "foreman", "safety_officer"].includes(person.role))
                            .map((person) => (
                              <option key={person.id} value={person.id}>
                                {person.fullName} · {t(`roleNames.${person.role}`)}
                              </option>
                            ))}
                        </select>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <div className="mt-2 flex gap-2">
                <Input
                  value={newArea[site.id] ?? ""}
                  onChange={(event) => setNewArea((current) => ({ ...current, [site.id]: event.target.value }))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void addArea(site.id);
                  }}
                  placeholder={t("settings.areaPlaceholder")}
                  className="h-11"
                />
                <Button type="button" variant="outline" className="h-11 shrink-0 gap-1" onClick={() => void addArea(site.id)}>
                  <PlusIcon className="size-4" />
                  {t("picker.add")}
                </Button>
              </div>
              <details className="mt-3 rounded-xl border border-border bg-background/60 px-3 py-2">
                <summary className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-medium">
                  <QrCodeIcon className="size-4" />
                  {t("settings.placeQr")}
                </summary>
                <div className="grid gap-3 pt-3 sm:grid-cols-[13rem_1fr] sm:items-center">
                  <ReportQr
                    url={keyOf(site.id) ? reportUrl(keyOf(site.id) as string, baseUrl) : null}
                    title={site.name}
                    subtitle={site.city || undefined}
                    onRotate={() => rotate({ siteId: site.id })}
                  />
                  <p className="text-xs text-muted-foreground">{t("settings.placeQrHint")}</p>
                </div>
              </details>
            </div>
          ))}
        </div>
        <div className="grid gap-2 rounded-xl border border-dashed border-border p-3 sm:grid-cols-[1fr_12rem_auto]">
          <Input value={newSite.name} onChange={(event) => setNewSite((current) => ({ ...current, name: event.target.value }))} placeholder={t("settings.placeName")} className="h-11" />
          <Input value={newSite.city} onChange={(event) => setNewSite((current) => ({ ...current, city: event.target.value }))} placeholder={t("settings.placeCity")} className="h-11" />
          <Button type="button" className="h-11 gap-1" onClick={() => void addSite()} disabled={!newSite.name.trim()}>
            <PlusIcon className="size-4" />
            {t("settings.addPlace")}
          </Button>
        </div>
      </section>

      {/* Risk types */}
      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <ShieldAlertIcon className="size-5" />
          {t("settings.risksTitle")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("settings.risksHint")}</p>
        <div className="flex flex-wrap gap-1.5">
          {riskTypes.map((risk) => (
            <span key={risk.id} className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-sm font-medium text-amber-800 dark:text-amber-200">
              {risk.label}
              <button
                type="button"
                aria-label={`× ${risk.label}`}
                onClick={() =>
                  void removeRiskType(risk.id)
                    .then(() => setRiskTypes((current) => current.filter((item) => item.id !== risk.id)))
                    .catch((caught) => toast.error(errorText(caught, t("toast.capaFailed"))))
                }
                className="rounded-full p-0.5 hover:bg-amber-500/25"
              >
                <XIcon className="size-3.5" />
              </button>
            </span>
          ))}
          {riskTypes.length === 0 && <span className="text-sm text-muted-foreground">{t("settings.noRisks")}</span>}
        </div>
        <div className="flex gap-2">
          <Input
            value={newRisk}
            onChange={(event) => setNewRisk(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void addRisk();
            }}
            placeholder={t("settings.riskPlaceholder")}
            className="h-11"
          />
          <Button type="button" className="h-11 shrink-0 gap-1" onClick={() => void addRisk()} disabled={!newRisk.trim()}>
            <PlusIcon className="size-4" />
            {t("picker.add")}
          </Button>
        </div>
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer">{t("settings.builtInRisks")}</summary>
          <p className="mt-2">{RISK_CATEGORIES.map((item) => categoryLabel(item.id, locale)).join(" · ")}</p>
        </details>
      </section>

      {/* Subcontractors */}
      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <HardHatIcon className="size-5" />
          {t("settings.subsTitle")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("settings.subsHint")}</p>
        <div className="flex flex-wrap gap-1.5">
          {subcontractors.map((sub) => (
            <span key={sub.id} className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/40 px-2.5 py-1 text-sm">
              {sub.name}
              <button
                type="button"
                aria-label={`× ${sub.name}`}
                onClick={() =>
                  void removeSubcontractor(sub.id)
                    .then(() => setSubcontractors((current) => current.filter((item) => item.id !== sub.id)))
                    .catch((caught) => toast.error(errorText(caught, t("toast.capaFailed"))))
                }
                className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
              >
                <XIcon className="size-3.5" />
              </button>
            </span>
          ))}
          {subcontractors.length === 0 && <span className="text-sm text-muted-foreground">{t("settings.noSubs")}</span>}
        </div>
        <div className="flex gap-2">
          <Input
            value={newSub}
            onChange={(event) => setNewSub(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void addSubcontractor();
            }}
            placeholder={t("settings.subPlaceholder")}
            className="h-11"
          />
          <Button type="button" className="h-11 shrink-0 gap-1" onClick={() => void addSubcontractor()} disabled={!newSub.trim()}>
            <PlusIcon className="size-4" />
            {t("picker.add")}
          </Button>
        </div>
      </section>

      {/* People */}
      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <UsersIcon className="size-5" />
            {t("settings.peopleTitle")}
          </h2>
          <Link href="/people" className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium hover:bg-secondary/60">
            <UploadIcon className="size-4" />
            {t("settings.importExcel")}
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">{t("settings.peopleHint")}</p>
        <StaffForm organizationId={organizationId} sites={orgSites} onCreated={(created) => setPeople((current) => [...current, created])} />
        <ul className="divide-y divide-border rounded-xl border border-border">
          {people.length === 0 && <li className="px-4 py-3 text-sm text-muted-foreground">{t("people.empty")}</li>}
          {people.map((person) => (
            <li key={person.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="block font-medium">{person.fullName}</span>
                <span className="block text-xs text-muted-foreground">{[person.email, person.siteName].filter(Boolean).join(" · ") || "—"}</span>
              </span>
              <span className="rounded-full border border-border px-2.5 py-0.5 text-xs">{t(`roleNames.${person.role}`)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

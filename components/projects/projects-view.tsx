"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Building2Icon, PlusIcon, SettingsIcon, UserCogIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QrBlock } from "@/components/qr/qr-block";
import { StaffForm } from "@/components/settings/staff-form";
import { can } from "@/lib/auth/permissions";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { companyReportUrl } from "@/lib/qr/urls";
import { useIncidentStore } from "@/lib/store/incident-store";
import { panelClass } from "@/lib/tones";
import { cn } from "@/lib/utils";
import type { Organization, Profile } from "@/lib/types";

/**
 * The app owner's panel. One company per customer (a car plant, a bottle
 * factory, a construction firm…): each gets its own QR code for anonymous
 * reports, its own managers, and sees only its own data.
 */
export function ProjectsView() {
  const { t } = useLanguage();
  const { role, sites, listOrganizations, createOrganization, updateOrganization, listProfiles } = useIncidentStore();
  const allowed = can(role, "projects.manage");
  const [organizations, setOrganizations] = useState<Organization[] | null>(null);
  const [managers, setManagers] = useState<Profile[]>([]);
  const [form, setForm] = useState({ name: "", organizationNumber: "", industry: "" });
  const [busy, setBusy] = useState(false);
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    Promise.all([listOrganizations(), listProfiles()])
      .then(([orgs, people]) => {
        if (cancelled) return;
        setOrganizations(orgs);
        setManagers(people.filter((person) => person.role === "hse_manager" || person.role === "admin"));
      })
      .catch((caught: { message?: string }) => {
        if (!cancelled) {
          setOrganizations([]);
          toast.error(caught?.message ?? "Could not load companies.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [allowed, listOrganizations, listProfiles]);

  if (!allowed) {
    return <p className={cn("rounded-xl border px-4 py-3 text-sm", panelClass.warning)}>{t("projects.ownerOnly")}</p>;
  }

  async function addCompany() {
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      const created = await createOrganization(form);
      setOrganizations((current) => [...(current ?? []), created]);
      setForm({ name: "", organizationNumber: "", industry: "" });
      setAddingFor(created.id);
      toast.success(t("projects.companyCreated"));
    } catch (caught) {
      toast.error((caught as { message?: string })?.message ?? t("toast.capaFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-[0.16em] text-amber-700 uppercase dark:text-amber-400">{t("projects.eyebrow")}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("projects.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("projects.body")}</p>
      </div>

      <div className={cn("rounded-2xl border p-4 text-sm", panelClass.info)}>
        <p className="font-semibold">{t("projects.isolationTitle")}</p>
        <p className="mt-1 opacity-85">{t("projects.isolationBody")}</p>
      </div>

      <section className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-[1fr_12rem_12rem_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="company-name">{t("projects.companyName")}</Label>
          <Input id="company-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder={t("projects.companyNameHint")} className="h-12" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="company-industry">{t("projects.industry")}</Label>
          <Input id="company-industry" value={form.industry} onChange={(event) => setForm((current) => ({ ...current, industry: event.target.value }))} placeholder={t("projects.industryHint")} className="h-12" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="company-number">{t("projects.orgNumber")}</Label>
          <Input id="company-number" value={form.organizationNumber} onChange={(event) => setForm((current) => ({ ...current, organizationNumber: event.target.value }))} className="h-12" />
        </div>
        <Button type="button" className="h-12 gap-2" disabled={busy || !form.name.trim()} onClick={() => void addCompany()}>
          <PlusIcon className="size-4" />
          {t("projects.addCompany")}
        </Button>
      </section>

      {organizations !== null && organizations.length === 0 && (
        <p className="rounded-2xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">{t("projects.noCompanies")}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {(organizations ?? []).map((org) => {
          const orgManagers = managers.filter((person) => person.organizationId === org.id);
          const orgSites = sites.filter((site) => site.organizationId === org.id);
          return (
            <article key={org.id} className={cn("flex flex-col gap-4 rounded-2xl border border-border bg-card p-4", !org.active && "opacity-60")}>
              <div className="flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-amber-700 dark:text-amber-300">
                  <Building2Icon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-semibold">{org.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    {[org.industry, org.organizationNumber, t("projects.placeCount", { n: orgSites.length })].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 shrink-0 text-muted-foreground"
                  onClick={() =>
                    void updateOrganization(org.id, { active: !org.active }).then((updated) =>
                      setOrganizations((current) => (current ?? []).map((item) => (item.id === updated.id ? updated : item)))
                    )
                  }
                >
                  {org.active ? t("audits.deactivate") : t("audits.activate")}
                </Button>
              </div>

              <div className="grid gap-4 sm:grid-cols-[13rem_1fr]">
                <QrBlock url={companyReportUrl(org.id, origin)} title={org.name} />
                <div className="min-w-0 space-y-2">
                  <p className="text-sm font-semibold">{t("projects.managers")}</p>
                  {orgManagers.length === 0 ? (
                    <p className={cn("rounded-lg border px-3 py-2 text-xs", panelClass.warning)}>{t("projects.noManager")}</p>
                  ) : (
                    <ul className="space-y-1 text-sm">
                      {orgManagers.map((person) => (
                        <li key={person.id} className="flex items-center gap-2">
                          <UserCogIcon className="size-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 truncate">
                            {person.fullName}
                            <span className="text-muted-foreground"> · {person.email ?? "—"}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button type="button" variant="outline" size="sm" className="h-10 gap-1" onClick={() => setAddingFor(addingFor === org.id ? null : org.id)}>
                      <PlusIcon className="size-4" />
                      {t("projects.addManager")}
                    </Button>
                    <Link href={`/settings?org=${org.id}`} className="inline-flex h-10 items-center gap-1 rounded-md border border-border px-3 text-sm font-medium hover:bg-secondary/60">
                      <SettingsIcon className="size-4" />
                      {t("home.settings")}
                    </Link>
                  </div>
                </div>
              </div>

              {addingFor === org.id && (
                <StaffForm
                  organizationId={org.id}
                  sites={orgSites}
                  roles={["hse_manager", "admin", "safety_officer"]}
                  defaultRole="hse_manager"
                  compact
                  onCreated={(created) => {
                    setManagers((current) => [...current, created]);
                    setAddingFor(null);
                  }}
                />
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

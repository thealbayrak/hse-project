"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Building2Icon, CopyIcon, DownloadIcon, PlusIcon, PrinterIcon, SettingsIcon, UserCogIcon } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StaffForm } from "@/components/settings/staff-form";
import { can } from "@/lib/auth/permissions";
import { APP_NAME } from "@/lib/constants";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useIncidentStore } from "@/lib/store/incident-store";
import { panelClass } from "@/lib/tones";
import { cn } from "@/lib/utils";
import type { Organization, Profile } from "@/lib/types";

export function companyReportUrl(organizationId: string, origin = typeof window === "undefined" ? "" : window.location.origin) {
  return `${origin}/report?org=${encodeURIComponent(organizationId)}`;
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

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
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ name: "", organizationNumber: "", industry: "" });
  const [busy, setBusy] = useState(false);
  const [addingFor, setAddingFor] = useState<string | null>(null);

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

  const orgKey = (organizations ?? []).map((org) => org.id).join(",");
  useEffect(() => {
    if (!orgKey) return;
    let cancelled = false;
    Promise.all(
      orgKey.split(",").map(async (id) => {
        const svg = await QRCode.toString(companyReportUrl(id), { type: "svg", margin: 1, width: 256, errorCorrectionLevel: "M" });
        return [id, svg] as const;
      })
    )
      .then((entries) => {
        if (!cancelled) setCodes(Object.fromEntries(entries));
      })
      .catch(() => {
        if (!cancelled) toast.error(t("projects.qrFailed"));
      });
    return () => {
      cancelled = true;
    };
  }, [orgKey, t]);

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

  async function copy(org: Organization) {
    try {
      await navigator.clipboard.writeText(companyReportUrl(org.id));
      toast.success(t("projects.copied"));
    } catch {
      toast.error(t("projects.copyFailed"));
    }
  }

  async function download(org: Organization) {
    const dataUrl = await QRCode.toDataURL(companyReportUrl(org.id), { margin: 2, width: 1024, errorCorrectionLevel: "M" });
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `qr-${org.name.replaceAll(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function print(org: Organization) {
    const svg = codes[org.id];
    if (!svg) return;
    const frame = document.createElement("iframe");
    Object.assign(frame.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(org.name)}</title>
      <style>body{font-family:system-ui,sans-serif;text-align:center;padding:40px;color:#0f172a}
      h1{font-size:30px;margin:0 0 6px}p{margin:6px 0;color:#475569}svg{width:70vw;max-width:520px;height:auto;margin:24px auto}
      .url{font-family:monospace;font-size:13px;word-break:break-all}</style></head>
      <body><h1>${escapeHtml(org.name)}</h1>
      ${svg}<p><strong>${escapeHtml(t("projects.printTitle"))}</strong></p><p>${escapeHtml(t("projects.printHint"))}</p>
      <p class="url">${escapeHtml(companyReportUrl(org.id))}</p><p>${APP_NAME}</p></body></html>`);
    doc.close();
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 60_000);
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
                <Button type="button" variant="ghost" size="sm" className="h-9 shrink-0 text-muted-foreground" onClick={() => void updateOrganization(org.id, { active: !org.active }).then((updated) => setOrganizations((current) => (current ?? []).map((item) => (item.id === updated.id ? updated : item))))}>
                  {org.active ? t("audits.deactivate") : t("audits.activate")}
                </Button>
              </div>

              <div className="grid gap-4 sm:grid-cols-[11rem_1fr]">
                <div>
                  <div
                    className="w-full rounded-xl bg-white p-2 [&_svg]:h-auto [&_svg]:w-full"
                    aria-label={t("projects.qrFor", { site: org.name })}
                    // The SVG comes from the qrcode library, not from user input.
                    dangerouslySetInnerHTML={{ __html: codes[org.id] ?? "" }}
                  />
                  <div className="mt-2 grid grid-cols-3 gap-1">
                    <Button type="button" variant="outline" size="icon" className="h-10 w-full" aria-label={t("projects.copy")} onClick={() => void copy(org)}>
                      <CopyIcon className="size-4" />
                    </Button>
                    <Button type="button" variant="outline" size="icon" className="h-10 w-full" aria-label="PNG" onClick={() => void download(org)}>
                      <DownloadIcon className="size-4" />
                    </Button>
                    <Button type="button" variant="outline" size="icon" className="h-10 w-full" aria-label={t("projects.print")} onClick={() => print(org)}>
                      <PrinterIcon className="size-4" />
                    </Button>
                  </div>
                </div>
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
                  <p className="truncate font-mono text-[11px] text-muted-foreground" title={companyReportUrl(org.id)}>
                    {companyReportUrl(org.id)}
                  </p>
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

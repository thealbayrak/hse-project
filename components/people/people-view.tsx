"use client";

import { useEffect, useRef, useState } from "react";
import { DownloadIcon, Loader2Icon, SearchIcon, Trash2Icon, UploadIcon, UsersIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { can } from "@/lib/auth/permissions";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { buildTemplateWorkbook, parsePeopleFile } from "@/lib/people/import";
import { useIncidentStore } from "@/lib/store/incident-store";
import { panelClass } from "@/lib/tones";
import { cn } from "@/lib/utils";
import { assignableRoles } from "@/lib/admin/staff-rules";
import type { Profile, Role } from "@/lib/types";

export function PeopleView() {
  const { t } = useLanguage();
  const { role, sites, listProfiles, importProfiles, updateProfile, removeProfile } = useIncidentStore();
  const [people, setPeople] = useState<Profile[] | null>(null);
  const [query, setQuery] = useState("");
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const allowed = can(role, "people.manage");

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    listProfiles()
      .then((rows) => {
        if (!cancelled) setPeople(rows);
      })
      .catch((caught: { message?: string }) => {
        if (!cancelled) {
          setPeople([]);
          toast.error(caught?.message ?? "Could not load people.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [allowed, listProfiles]);

  async function onFile(file: File | null) {
    if (!file) return;
    setImporting(true);
    try {
      const rows = await parsePeopleFile(file);
      const result = await importProfiles(rows);
      toast.success(t("people.imported", { created: result.created, updated: result.updated, skipped: result.skipped.length }));
      if (result.skipped.length) {
        toast.message(result.skipped.slice(0, 3).map((item) => `#${item.row}: ${item.reason}`).join(" · "));
      }
      setPeople(await listProfiles());
    } catch (caught) {
      toast.error((caught as { message?: string })?.message ?? t("people.importFailed"));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function downloadTemplate() {
    const buffer = buildTemplateWorkbook();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "sitesafety-people-template.xlsx";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function patch(id: string, changes: Partial<Omit<Profile, "id">>) {
    try {
      const updated = await updateProfile(id, changes);
      setPeople((current) => (current ?? []).map((person) => (person.id === id ? updated : person)));
      toast.success(t("people.saved"));
    } catch (caught) {
      toast.error((caught as { message?: string })?.message ?? t("toast.capaFailed"));
    }
  }

  async function remove(id: string) {
    try {
      await removeProfile(id);
      setPeople((current) => (current ?? []).filter((person) => person.id !== id));
      toast.success(t("people.removed"));
    } catch (caught) {
      toast.error((caught as { message?: string })?.message ?? t("toast.capaFailed"));
    }
  }

  if (!allowed) {
    return <p className={cn("rounded-xl border px-4 py-3 text-sm", panelClass.warning)}>{t("auth.body")}</p>;
  }

  const filtered = (people ?? []).filter((person) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return [person.fullName, person.email, person.employeeNo, person.siteName, person.reportsToName]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle));
  });
  const managers = (people ?? []).filter((person) => person.role !== "worker");

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-amber-700 uppercase dark:text-amber-400">{t("roles.officerEyebrow")}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("people.title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("people.body")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(event) => void onFile(event.target.files?.[0] ?? null)}
          />
          <Button type="button" variant="outline" className="h-12 gap-2" onClick={downloadTemplate}>
            <DownloadIcon className="size-4" />
            {t("people.template")}
          </Button>
          <Button type="button" className="h-12 gap-2" disabled={importing} onClick={() => fileRef.current?.click()}>
            {importing ? <Loader2Icon className="size-4 animate-spin" /> : <UploadIcon className="size-4" />}
            {importing ? t("people.importing") : t("people.import")}
          </Button>
        </div>
      </div>

      <div className={cn("rounded-2xl border p-4 text-sm", panelClass.info)}>
        <p className="font-semibold">{t("people.flow")}</p>
        <p className="mt-1 opacity-85">{t("people.flowBody")}</p>
        <p className="mt-2 text-xs opacity-75">{t("people.columns")}</p>
        <p className="mt-1 text-xs opacity-75">{t("people.loginNote")}</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("people.search")} className="h-12 pl-10" />
        </div>
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <UsersIcon className="size-4" />
          {t("people.count", { n: filtered.length })}
        </span>
      </div>

      {people === null ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" />…
        </p>
      ) : filtered.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">{t("people.empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[840px] text-sm">
            <thead className="bg-secondary/50 text-left text-xs tracking-wide text-muted-foreground uppercase">
              <tr>
                <th className="px-3 py-2.5">{t("people.name")}</th>
                <th className="px-3 py-2.5">{t("people.role")}</th>
                <th className="px-3 py-2.5">{t("people.site")}</th>
                <th className="px-3 py-2.5">{t("people.reportsTo")}</th>
                <th className="px-3 py-2.5">{t("people.employeeNo")}</th>
                <th className="px-3 py-2.5">{t("people.active")}</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((person) => (
                <tr key={person.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <span className="block font-medium">{person.fullName}</span>
                    <span className="block text-xs text-muted-foreground">{person.email ?? person.phone ?? "—"}</span>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={person.role}
                      disabled={!assignableRoles(role).includes(person.role)}
                      onChange={(event) => void patch(person.id, { role: event.target.value as Role })}
                      className="h-10 rounded-lg border border-border bg-background px-2 disabled:opacity-60"
                    >
                      {(assignableRoles(role).includes(person.role) ? assignableRoles(role) : [person.role]).map((item) => (
                        <option key={item} value={item}>
                          {t(`roleNames.${item}`)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={person.siteId ?? ""}
                      onChange={(event) => void patch(person.id, { siteId: event.target.value || null })}
                      className="h-10 max-w-52 rounded-lg border border-border bg-background px-2"
                    >
                      <option value="">{t("people.allSites")}</option>
                      {sites.map((site) => (
                        <option key={site.id} value={site.id}>
                          {site.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={person.reportsTo ?? ""}
                      onChange={(event) => void patch(person.id, { reportsTo: event.target.value || null })}
                      className="h-10 max-w-52 rounded-lg border border-border bg-background px-2"
                    >
                      <option value="">{t("people.nobody")}</option>
                      {managers
                        .filter((manager) => manager.id !== person.id)
                        .map((manager) => (
                          <option key={manager.id} value={manager.id}>
                            {manager.fullName} · {t(`roleNames.${manager.role}`)}
                          </option>
                        ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{person.employeeNo ?? "—"}</td>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={person.active}
                      onChange={(event) => void patch(person.id, { active: event.target.checked })}
                      className="size-5 accent-amber-500"
                      aria-label={t("people.active")}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button type="button" variant="ghost" size="icon" className="size-10 text-muted-foreground" aria-label={t("people.remove")} onClick={() => void remove(person.id)}>
                      <Trash2Icon className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { EyeIcon, EyeOffIcon, UserPlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { assignableRoles } from "@/lib/admin/staff-rules";
import { SiteScopeFields, seesEverything } from "@/components/people/site-scope";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useIncidentStore } from "@/lib/store/incident-store";
import type { Profile, Role, Site } from "@/lib/types";

/**
 * Adds a person to a company. E-mail and password are optional: without them
 * the person is only a name (for the reporter list and task assignment).
 */
export function StaffForm({
  organizationId,
  sites,
  roles,
  defaultRole = "worker",
  onCreated,
  compact = false,
}: {
  organizationId: string;
  sites: Site[];
  roles?: Role[];
  defaultRole?: Role;
  onCreated: (profile: Profile) => void;
  compact?: boolean;
}) {
  const { t } = useLanguage();
  const { role: callerRole, createStaff } = useIncidentStore();
  const allowed = roles ?? assignableRoles(callerRole);
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Role>(allowed.includes(defaultRole) ? defaultRole : (allowed[0] ?? "worker"));
  const [siteId, setSiteId] = useState("");
  const [scope, setScope] = useState<{ allSites: boolean; siteIds: string[] }>({ allSites: true, siteIds: [] });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (fullName.trim().length < 2) {
      toast.error(t("settings.needName"));
      return;
    }
    if (password && !email.trim()) {
      toast.error(t("settings.needEmail"));
      return;
    }
    if (password && password.length < 8) {
      toast.error(t("settings.shortPassword"));
      return;
    }
    setBusy(true);
    try {
      const result = await createStaff({
        fullName,
        role,
        organizationId,
        siteId: siteId || null,
        allSites: seesEverything(role) ? true : scope.allSites,
        siteIds: seesEverything(role) || scope.allSites ? [] : scope.siteIds,
        email: email.trim() || null,
        password: password || null,
      });
      onCreated(result.profile);
      toast.success(t(`settings.login_${result.login}`, { name: result.profile.fullName }));
      setFullName("");
      setEmail("");
      setPassword("");
    } catch (caught) {
      toast.error((caught as { message?: string })?.message ?? t("toast.capaFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3 rounded-2xl border border-border bg-background p-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor={`staff-name-${organizationId}`}>{t("people.name")}</Label>
        <Input id={`staff-name-${organizationId}`} value={fullName} onChange={(event) => setFullName(event.target.value)} className="h-12" autoComplete="off" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`staff-role-${organizationId}`}>{t("people.role")}</Label>
        <select id={`staff-role-${organizationId}`} value={role} onChange={(event) => setRole(event.target.value as Role)} className="h-12 w-full rounded-lg border border-border bg-background px-3">
          {allowed.map((item) => (
            <option key={item} value={item}>
              {t(`roleNames.${item}`)}
            </option>
          ))}
        </select>
      </div>
      {!compact && sites.length > 0 && (
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`staff-site-${organizationId}`}>{t("settings.place")}</Label>
          <select id={`staff-site-${organizationId}`} value={siteId} onChange={(event) => setSiteId(event.target.value)} className="h-12 w-full rounded-lg border border-border bg-background px-3">
            <option value="">{t("people.allSites")}</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {!compact && sites.length > 1 && !seesEverything(role) && (
        <div className="space-y-1.5 sm:col-span-2">
          <Label>{t("people.scope")}</Label>
          <SiteScopeFields sites={sites} allSites={scope.allSites} siteIds={scope.siteIds} onChange={setScope} idPrefix={`staff-scope-${organizationId}`} />
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor={`staff-email-${organizationId}`}>{t("settings.email")}</Label>
        <Input id={`staff-email-${organizationId}`} type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-12" autoComplete="off" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`staff-password-${organizationId}`}>{t("settings.password")}</Label>
        <div className="relative">
          <Input
            id={`staff-password-${organizationId}`}
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-12 pr-12"
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={t("settings.showPassword")}
            className="absolute top-1/2 right-2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground"
          >
            {showPassword ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
          </button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground sm:col-span-2">{t("settings.loginHint")}</p>
      <div className="sm:col-span-2">
        <Button type="button" className="h-12 w-full gap-2 sm:w-auto" disabled={busy} onClick={() => void submit()}>
          <UserPlusIcon className="size-4" />
          {busy ? t("tasks.creating") : t("settings.addPerson")}
        </Button>
      </div>
    </div>
  );
}

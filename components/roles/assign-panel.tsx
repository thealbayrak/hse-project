"use client";

import { useEffect, useState } from "react";
import { LockIcon, SaveIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useIncidentStore } from "@/lib/store/incident-store";
import { panelClass } from "@/lib/tones";
import { cn } from "@/lib/utils";
import type { Incident, Profile } from "@/lib/types";

const MANAGER_ROLES = ["hse_manager", "admin", "super_admin"];

function soon(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Puts people on a report: who repairs it (action owner), who investigates it and who checks the repair.
 * An area responsible and a manager both use it; once a manager has set the people, the area responsible
 * can no longer change them. `includeActionOwner` is off where the action owner is chosen elsewhere.
 */
export function AssignPanel({
  incident,
  includeActionOwner = true,
  onSaved,
}: {
  incident: Incident;
  includeActionOwner?: boolean;
  onSaved?: () => void;
}) {
  const { t } = useLanguage();
  const { role, assignIncident, listProfiles } = useIncidentStore();
  const assignment = incident.assignment ?? null;
  const [people, setPeople] = useState<Profile[]>([]);
  const [actionOwnerId, setActionOwnerId] = useState(assignment?.actionOwnerId ?? "");
  const [investigatorId, setInvestigatorId] = useState(assignment?.investigatorId ?? "");
  const [followUpId, setFollowUpId] = useState(assignment?.followUpId ?? "");
  const [actionDue, setActionDue] = useState(incident.capa?.dueDate ?? "");
  const [required, setRequired] = useState(assignment?.investigationRequired ?? incident.type === "accident");
  const [investigationDue, setInvestigationDue] = useState(assignment?.investigationDueDate ?? "");
  const [busy, setBusy] = useState(false);
  const isManager = MANAGER_ROLES.includes(role ?? "");
  const locked = Boolean(assignment?.managerLocked) && !isManager;

  useEffect(() => {
    let cancelled = false;
    listProfiles()
      .then((rows) => {
        if (!cancelled) setPeople(rows.filter((person) => person.active && person.role !== "worker" && person.role !== "super_admin" && (!incident.organizationId || !person.organizationId || person.organizationId === incident.organizationId)));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [listProfiles, incident.organizationId]);

  async function save() {
    if (actionOwnerId && !actionDue) {
      toast.error(t("flow.needActionDue"));
      return;
    }
    if (required && investigatorId && !investigationDue) {
      toast.error(t("flow.needInvestigationDue"));
      return;
    }
    setBusy(true);
    try {
      await assignIncident({
        incidentId: incident.id,
        actionOwnerId: includeActionOwner ? actionOwnerId || null : (assignment?.actionOwnerId ?? null),
        investigatorId: investigatorId || null,
        followUpId: followUpId || null,
        investigationRequired: required,
        investigationDueDate: required ? investigationDue || null : null,
        actionDueDate: actionDue || null,
      });
      toast.success(t("flow.assignmentsSaved"));
      onSaved?.();
    } catch (caught) {
      toast.error((caught as { message?: string })?.message ?? t("toast.capaFailed"));
    } finally {
      setBusy(false);
    }
  }

  const options = (
    <>
      <option value="">{t("flow.notAssigned")}</option>
      {people.map((person) => (
        <option key={person.id} value={person.id}>
          {person.fullName} · {t(`roleNames.${person.role}`)}
        </option>
      ))}
    </>
  );
  const selectClass = "h-12 w-full rounded-lg border border-border bg-background px-3 disabled:opacity-60";

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-background/60 p-3">
      {assignment?.areaResponsibleName && (
        <p className="text-xs text-muted-foreground">
          {t("flow.areaResponsible")}: <strong className="text-foreground">{assignment.areaResponsibleName}</strong>
        </p>
      )}
      {locked && (
        <p className={cn("flex items-start gap-2 rounded-lg border px-3 py-2 text-sm", panelClass.warning)}>
          <LockIcon className="mt-0.5 size-4 shrink-0" />
          {t("flow.lockedByManager")}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {includeActionOwner && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor={`owner-${incident.id}`}>{t("flow.actionOwner")}</Label>
              <select id={`owner-${incident.id}`} value={actionOwnerId} disabled={locked} onChange={(event) => setActionOwnerId(event.target.value)} className={selectClass}>
                {options}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`due-${incident.id}`}>{t("flow.actionDue")}</Label>
              <Input id={`due-${incident.id}`} type="date" value={actionDue} min={soon(0)} disabled={locked} onChange={(event) => setActionDue(event.target.value)} className="h-12" />
            </div>
          </>
        )}
        <div className="space-y-1.5">
          <Label htmlFor={`inv-${incident.id}`}>{t("flow.investigator")}</Label>
          <select id={`inv-${incident.id}`} value={investigatorId} disabled={locked} onChange={(event) => setInvestigatorId(event.target.value)} className={selectClass}>
            {options}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`fu-${incident.id}`}>{t("flow.followUp")}</Label>
          <select id={`fu-${incident.id}`} value={followUpId} disabled={locked} onChange={(event) => setFollowUpId(event.target.value)} className={selectClass}>
            {options}
          </select>
        </div>
      </div>

      <label className="flex min-h-12 items-center justify-between gap-4 rounded-xl border border-border bg-card px-3">
        <span>
          <span className="block text-sm font-medium">{t("flow.investigationRequired")}</span>
          <span className="block text-xs text-muted-foreground">{t("flow.investigationRequiredHint")}</span>
        </span>
        <Switch checked={required} disabled={locked} onCheckedChange={setRequired} className="h-7 w-12" />
      </label>
      {required && (
        <div className="space-y-1.5">
          <Label htmlFor={`invdue-${incident.id}`}>{t("flow.investigationDue")}</Label>
          <Input id={`invdue-${incident.id}`} type="date" value={investigationDue} disabled={locked} onChange={(event) => setInvestigationDue(event.target.value)} className="h-12" />
        </div>
      )}

      <p className="text-xs text-muted-foreground">{t("flow.assignMailHint")}</p>
      <Button type="button" className="h-12 w-full gap-2 sm:w-auto" disabled={busy || locked} onClick={() => void save()}>
        <SaveIcon className="size-4" />
        {busy ? t("flow.saving") : t("flow.saveAssignments")}
      </Button>
    </div>
  );
}

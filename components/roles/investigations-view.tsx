"use client";

import { useMemo, useState } from "react";
import { SaveIcon } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, ReportCard, RoleHeader } from "@/components/roles/report-card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { can } from "@/lib/auth/permissions";
import { formatDate } from "@/lib/format";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { investigationOverdue, investigationsFor } from "@/lib/roles/queries";
import { useIncidentStore } from "@/lib/store/incident-store";
import { panelClass } from "@/lib/tones";
import { cn } from "@/lib/utils";
import type { Incident, InvestigationStatus } from "@/lib/types";

const STATUSES: InvestigationStatus[] = ["open", "in-progress", "done"];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function InvestigationCard({ incident }: { incident: Incident }) {
  const { locale, t } = useLanguage();
  const { saveInvestigation } = useIncidentStore();
  const a = incident.assignment;
  const [status, setStatus] = useState<InvestigationStatus>(a?.investigationStatus ?? "open");
  const [rootCause, setRootCause] = useState(a?.rootCause ?? "");
  const [notes, setNotes] = useState(a?.investigationNotes ?? "");
  const [busy, setBusy] = useState(false);
  const overdue = investigationOverdue(incident, todayIso());

  async function save() {
    if (status === "done" && rootCause.trim().length < 5) {
      toast.error(t("flow.needRootCause"));
      return;
    }
    setBusy(true);
    try {
      await saveInvestigation({ incidentId: incident.id, status, rootCause, notes });
      toast.success(t("flow.investigationSaved"));
    } catch (caught) {
      toast.error((caught as { message?: string })?.message ?? t("toast.capaFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ReportCard
      incident={incident}
      badge={
        a?.investigationStatus === "done"
          ? { text: t("flow.st_done"), tone: "success" }
          : overdue
            ? { text: t("flow.overdue"), tone: "danger" }
            : !a?.investigatorId
              ? { text: t("flow.noInvestigator"), tone: "warning" }
              : undefined
      }
    >
      {a?.investigationDueDate && (
        <p className={cn("text-xs font-semibold", overdue && "text-red-700 dark:text-red-300")}>
          {t("flow.investigationDueOn", { date: formatDate(a.investigationDueDate, locale) })}
        </p>
      )}
      <div className="space-y-3 rounded-2xl border border-border bg-background/60 p-3">
        <label className="block space-y-1.5 text-sm font-medium">
          {t("flow.status")}
          <select value={status} onChange={(event) => setStatus(event.target.value as InvestigationStatus)} className="h-12 w-full rounded-lg border border-border bg-background px-3 sm:w-64">
            {STATUSES.map((item) => (
              <option key={item} value={item}>
                {t(`flow.st_${item}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5 text-sm font-medium">
          {t("flow.rootCause")}
          <Textarea value={rootCause} onChange={(event) => setRootCause(event.target.value)} placeholder={t("flow.rootCausePh")} className="min-h-24" />
        </label>
        <label className="block space-y-1.5 text-sm font-medium">
          {t("flow.invNotes")}
          <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={t("flow.invNotesPh")} className="min-h-20" />
        </label>
        <Button type="button" className="h-12 gap-2" disabled={busy} onClick={() => void save()}>
          <SaveIcon className="size-4" />
          {busy ? t("flow.saving") : t("flow.saveInvestigation")}
        </Button>
      </div>
    </ReportCard>
  );
}

/** The investigator's page: root-cause analysis with a due date for every report that needs one. */
export function InvestigationsView() {
  const { t } = useLanguage();
  const { incidents, profile, role } = useIncidentStore();
  const allowed = can(role, "investigations.work");
  // An investigator sees what they were named on; officers and managers see all that require an investigation.
  const seesAll = role !== "investigator";
  const list = useMemo(() => investigationsFor(incidents, profile?.id, seesAll), [incidents, profile, seesAll]);
  const open = list.filter((incident) => incident.assignment?.investigationStatus !== "done");
  const done = list.filter((incident) => incident.assignment?.investigationStatus === "done");

  if (!allowed) return <p className={cn("rounded-xl border px-4 py-3 text-sm", panelClass.warning)}>{t("flow.notAllowed")}</p>;

  return (
    <div className="space-y-5">
      <RoleHeader eyebrow={t("roleNames.investigator")} title={t("flow.invTitle")} hint={t("flow.invHint")} />
      <h2 className="text-lg font-semibold">{t("flow.invOpen", { n: open.length })}</h2>
      {open.length === 0 ? <EmptyState text={t("flow.nothingHere")} /> : <div className="space-y-3">{open.map((incident) => <InvestigationCard key={incident.id} incident={incident} />)}</div>}
      {done.length > 0 && (
        <>
          <h2 className="text-lg font-semibold">{t("flow.invDone", { n: done.length })}</h2>
          <div className="space-y-3">{done.map((incident) => <InvestigationCard key={incident.id} incident={incident} />)}</div>
        </>
      )}
    </div>
  );
}

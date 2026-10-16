"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { AmlNoticeDialog } from "@/components/dashboard/aml-notice-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_REPORTER_NAME, INCIDENT_STATUSES, SAFETY_OFFICERS, SEVERITY_LEVELS } from "@/lib/constants";
import {
  categoryLabel,
  formatDateTime,
  placeLabel,
  severityLabel,
  statusLabel,
  typeLabel,
} from "@/lib/format";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { addBusinessDaysIsoDate } from "@/lib/skyddsrond/business-days";
import { useIncidentStore } from "@/lib/store/incident-store";
import { cn } from "@/lib/utils";
import { panelClass, severityClass, statusClass } from "@/lib/tones";
import type { Incident, IncidentStatus, Severity } from "@/lib/types";

export function IncidentDetailDialog({
  incident,
  onClose,
}: {
  incident: Incident | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!incident} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" showCloseButton>
        {/* Keyed by incident so the CAPA form resets whenever another incident opens. */}
        {incident && <IncidentDetail key={incident.id} incident={incident} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function IncidentDetail({ incident, onClose }: { incident: Incident; onClose: () => void }) {
  const { sites, updateCapa } = useIncidentStore();
  const { locale, t } = useLanguage();
  const [assigneeId, setAssigneeId] = useState<string>(
    () => incident.capa?.assigneeId || SAFETY_OFFICERS[0].id
  );
  const [dueDate, setDueDate] = useState(() => incident.capa?.dueDate || defaultDueDate());
  const [status, setStatus] = useState<IncidentStatus>(() => incident.capa?.status ?? incident.status);
  const [severity, setSeverity] = useState<Severity>(incident.severity);
  const [notes, setNotes] = useState(() => incident.capa?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [amlOpen, setAmlOpen] = useState(false);
  const site = sites.find((item) => item.id === incident.siteId) ?? null;

  async function save() {
    const officer = SAFETY_OFFICERS.find((item) => item.id === assigneeId);
    if (!officer || !dueDate) {
      toast.error(t("toast.capaNeedOwner"));
      return;
    }
    setSaving(true);
    try {
      await updateCapa(incident.id, {
        assigneeId: officer.id,
        assigneeName: officer.name,
        dueDate,
        status,
        notes: notes.trim(),
        severity: severity !== incident.severity ? severity : undefined,
      });
      toast.success(t("toast.capaSaved"));
      onClose();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : t("toast.capaFailed");
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="font-mono text-amber-700 dark:text-amber-300">{incident.reference}</DialogTitle>
        <DialogDescription>
          {typeLabel(incident.type, locale)} · {placeLabel(incident)}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-wrap gap-2">
        <span className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", severityClass[incident.severity])}>
          {severityLabel(incident.severity, locale)}
        </span>
        <span className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", statusClass[incident.status])}>
          {statusLabel(incident.status, locale)}
        </span>
        <span className="rounded-full border border-border px-2.5 py-1 text-xs">
          {categoryLabel(incident.category, locale)}
        </span>
        <span className="rounded-full border border-border px-2.5 py-1 text-xs">
          {incident.anonymous
            ? t("report.anonymousPerson")
            : incident.reporterName === DEFAULT_REPORTER_NAME
              ? t("report.siteWorker")
              : incident.reporterName}
        </span>
      </div>

      <p className="text-sm leading-relaxed whitespace-pre-line">{incident.description}</p>
      <p className="text-xs text-muted-foreground">
        {t("dashboard.reported", { when: formatDateTime(incident.createdAt, locale) })}
      </p>

      <Button
        type="button"
        variant="outline"
        className={cn("h-12 w-full gap-2", panelClass.danger)}
        onClick={() => setAmlOpen(true)}
      >
        <FileText className="size-4" />
        {t("buttons.generateAml")}
      </Button>

      {!!incident.mediaUrls.length && (
        <div className="grid grid-cols-3 gap-2">
          {incident.mediaUrls.map((url, index) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={url.slice(0, 24) + index}
              src={url}
              alt={`Evidence photo ${index + 1}`}
              className="h-28 w-full rounded-lg object-cover"
            />
          ))}
        </div>
      )}

      {incident.audioUrl && (
        <div className="rounded-xl border border-border bg-secondary/30 p-3">
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t("dashboard.voiceNote")}
          </p>
          <audio controls preload="none" src={incident.audioUrl} className="w-full" />
        </div>
      )}

      <div className="rounded-xl border border-border bg-secondary/30 p-4">
        <h3 className="mb-3 text-sm font-semibold tracking-wide text-amber-700 uppercase dark:text-amber-300">
          {t("dashboard.capaTitle")}
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("dashboard.severityLabel")}</Label>
            <div className="grid grid-cols-4 gap-2">
              {SEVERITY_LEVELS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSeverity(item.id)}
                  className={cn(
                    "min-h-12 rounded-xl border px-2 text-xs font-semibold",
                    severity === item.id
                      ? cn(severityClass[item.id], "ring-2 ring-current/30")
                      : "border-border bg-background text-muted-foreground"
                  )}
                >
                  {severityLabel(item.id, locale)}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{t("dashboard.severityHint")}</p>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="assignee">{t("dashboard.assignee")}</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {SAFETY_OFFICERS.map((officer) => (
                <button
                  key={officer.id}
                  type="button"
                  onClick={() => setAssigneeId(officer.id)}
                  className={cn(
                    "min-h-14 rounded-xl border px-3 py-2 text-left",
                    assigneeId === officer.id
                      ? "border-amber-500 bg-amber-500/15"
                      : "border-border bg-background hover:bg-secondary/60"
                  )}
                >
                  <span className="block text-sm font-medium">{officer.name}</span>
                  <span className="text-xs text-muted-foreground">{t(`officerRoles.${officer.roleKey}`)}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="due">{t("dashboard.dueDate")}</Label>
            <Input
              id="due"
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              className="h-12"
            />
          </div>
          <div className="space-y-2">
            <Label>{t("dashboard.status")}</Label>
            <div className="grid grid-cols-3 gap-2">
              {INCIDENT_STATUSES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setStatus(item.id)}
                  className={cn(
                    "min-h-12 rounded-xl border px-2 text-xs font-medium",
                    status === item.id
                      ? "border-amber-500 bg-amber-500 text-slate-950"
                      : "border-border bg-background"
                  )}
                >
                  {statusLabel(item.id, locale)}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="notes">{t("dashboard.actionNotes")}</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={t("dashboard.actionNotesHint")}
              className="min-h-24"
            />
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" className="h-12" onClick={onClose}>
          {t("buttons.close")}
        </Button>
        <Button className="h-12" disabled={saving} onClick={() => void save()}>
          {saving ? t("buttons.saving") : t("buttons.saveCapa")}
        </Button>
      </DialogFooter>

      <AmlNoticeDialog incident={incident} site={site} open={amlOpen} onClose={() => setAmlOpen(false)} />
    </>
  );
}

/** Two Swedish business days from today, in Europe/Stockholm. */
function defaultDueDate() {
  return addBusinessDaysIsoDate(new Date(), 2);
}

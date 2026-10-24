"use client";

import { useEffect, useState } from "react";
import { CalendarPlusIcon, DownloadIcon, FileText, Loader2Icon, SparklesIcon } from "lucide-react";
import { downloadIncidentPdf } from "@/lib/export";
import { toast } from "sonner";
import { AmlNoticeDialog } from "@/components/dashboard/aml-notice-dialog";
import { MeetingDialog } from "@/components/dashboard/meeting-dialog";
import { analyzeIncident, languageName } from "@/lib/ai/client";
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
import Link from "next/link";
import { DEFAULT_REPORTER_NAME, INCIDENT_STATUSES, RISK_CATEGORIES, SEVERITY_LEVELS } from "@/lib/constants";
import { suggestSeverity } from "@/lib/report/severity";
import {
  categoriesLabel,
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
import { AssignPanel } from "@/components/roles/assign-panel";
import { PeopleLine } from "@/components/roles/report-card";
import { can } from "@/lib/auth/permissions";
import { panelClass, severityClass, statusClass } from "@/lib/tones";
import { incidentCategories, type Incident, type IncidentStatus, type Profile, type RiskCategory, type Severity } from "@/lib/types";

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
  const { sites, updateCapa, listRiskTypes, listProfiles, role: viewerRole } = useIncidentStore();
  // People who can own an action: the company's staff (not plain workers, not the app owner).
  const [people, setPeople] = useState<Profile[]>([]);
  useEffect(() => {
    let cancelled = false;
    listProfiles()
      .then((rows) => {
        if (!cancelled) setPeople(rows.filter((person) => person.active && person.role !== "worker" && person.role !== "super_admin"));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [listProfiles]);
  const [ownRisks, setOwnRisks] = useState<string[]>([]);
  useEffect(() => {
    if (!incident.organizationId) return;
    let cancelled = false;
    listRiskTypes(incident.organizationId)
      .then((rows) => {
        if (!cancelled) setOwnRisks(rows.map((row) => row.label));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [incident.organizationId, listRiskTypes]);
  const riskChoices = [
    ...RISK_CATEGORIES.map((item) => item.id as string),
    ...ownRisks,
    ...incidentCategories(incident),
  ].filter((value, index, list) => list.indexOf(value) === index);
  const { locale, t } = useLanguage();
  const [assigneeId, setAssigneeId] = useState<string>(() => incident.capa?.assigneeId || "");
  const [dueDate, setDueDate] = useState(() => incident.capa?.dueDate || defaultDueDate());
  const [status, setStatus] = useState<IncidentStatus>(() => incident.capa?.status ?? incident.status);
  const [severity, setSeverity] = useState<Severity>(incident.severity);
  const [categories, setCategories] = useState<RiskCategory[]>(() => incidentCategories(incident));
  const [notes, setNotes] = useState(() => incident.capa?.notes ?? "");
  const [publicNote, setPublicNote] = useState(() => incident.publicNote ?? "");
  const [saving, setSaving] = useState(false);
  const [amlOpen, setAmlOpen] = useState(false);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const site = sites.find((item) => item.id === incident.siteId) ?? null;

  // An owner saved earlier who is no longer in the list (older reports) stays selectable.
  const legacyOwner =
    incident.capa?.assigneeId && !people.some((person) => person.id === incident.capa!.assigneeId)
      ? { id: incident.capa.assigneeId, name: incident.capa.assigneeName || incident.capa.assigneeId }
      : null;
  const suggestion = suggestSeverity(incident.type, { hurt: incident.hurt, danger: incident.dangerPresent });

  async function save() {
    // The reporter does not rate the report; a manager must before it can be saved.
    if (severity === "unrated") {
      toast.error(t("dashboard.needSeverity"));
      return;
    }
    const owner = people.find((person) => person.id === assigneeId);
    const ownerName = owner?.fullName ?? (legacyOwner && legacyOwner.id === assigneeId ? legacyOwner.name : "");
    if (assigneeId && !dueDate) {
      toast.error(t("toast.capaNeedOwner"));
      return;
    }
    setSaving(true);
    try {
      await updateCapa(incident.id, {
        assigneeId,
        assigneeName: ownerName,
        dueDate: assigneeId ? dueDate : "",
        status,
        notes: notes.trim(),
        severity: severity !== incident.severity ? severity : undefined,
        categories: categories.join() !== incidentCategories(incident).join() ? categories : undefined,
        publicNote: publicNote.trim() !== (incident.publicNote ?? "") ? publicNote : undefined,
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
          {typeLabel(incident.type, locale, incident.typeNote)} · {placeLabel(incident)}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-wrap gap-2">
        <span className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", severityClass[incident.severity])}>
          {severityLabel(incident.severity, locale)}
        </span>
        <span className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", statusClass[incident.status])}>
          {statusLabel(incident.status, locale)}
        </span>
        <span
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs",
            incidentCategories(incident).length ? "border-border" : "border-amber-500/50 text-amber-700 dark:text-amber-300"
          )}
        >
          {categoriesLabel(incidentCategories(incident), locale)}
        </span>
        {incident.subcontractor && (
          <span className="rounded-full border border-border px-2.5 py-1 text-xs">{incident.subcontractor}</span>
        )}
        {incident.source === "audit" && (
          <span className="rounded-full border border-border px-2.5 py-1 text-xs">{t("audits.fromAudit")}</span>
        )}
        <span className="rounded-full border border-border px-2.5 py-1 text-xs">
          {incident.anonymous
            ? t("report.anonymousPerson")
            : incident.reporterName === DEFAULT_REPORTER_NAME
              ? t("report.siteWorker")
              : incident.reporterName}
        </span>
      </div>

      {incident.summarySv ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-secondary/40 px-4 py-3">
            <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{t("ai.summaryTitle")}</p>
            <p className="mt-1 text-sm leading-relaxed">{incident.summarySv}</p>
          </div>
          <details className="rounded-xl border border-border px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium">
              {t("ai.originalTitle")}
              {incident.originalLanguage ? ` · ${languageName(incident.originalLanguage, locale)}` : ""}
            </summary>
            <p className="mt-2 text-sm leading-relaxed whitespace-pre-line">{incident.originalText || incident.description}</p>
          </details>
        </div>
      ) : (
        <p className="text-sm leading-relaxed whitespace-pre-line">{incident.description}</p>
      )}
      <p className="text-xs text-muted-foreground">
        {t("dashboard.reported", { when: formatDateTime(incident.createdAt, locale) })}
      </p>

      <AnalysisPanel incident={incident} />

      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          variant="outline"
          className={cn("h-12 w-full gap-2", panelClass.danger)}
          onClick={() => setAmlOpen(true)}
        >
          <FileText className="size-4" />
          {t("buttons.generateAml")}
        </Button>
        <Button
          type="button"
          variant="outline"
          className={cn("h-12 w-full gap-2", panelClass.warning)}
          onClick={() => setMeetingOpen(true)}
        >
          <CalendarPlusIcon className="size-4" />
          {t("meeting.plan")}
        </Button>
      </div>

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
            {(incident.hurt != null || incident.dangerPresent != null) && (
              <div className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm">
                <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{t("dashboard.reporterSaid")}</p>
                <ul className="mt-1 space-y-0.5">
                  {incident.hurt != null && (
                    <li className={cn(incident.hurt && "font-semibold text-red-700 dark:text-red-300")}>
                      {t("report.hurtQuestion")} <strong>{incident.hurt ? t("buttons.yes") : t("buttons.no")}</strong>
                    </li>
                  )}
                  {incident.dangerPresent != null && (
                    <li className={cn(incident.dangerPresent && "font-semibold text-red-700 dark:text-red-300")}>
                      {t("report.dangerQuestion")} <strong>{incident.dangerPresent ? t("buttons.yes") : t("buttons.no")}</strong>
                    </li>
                  )}
                </ul>
                {suggestion && severity !== suggestion && (
                  <button
                    type="button"
                    onClick={() => setSeverity(suggestion)}
                    className="mt-2 inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-xs font-semibold hover:bg-secondary/60"
                  >
                    {t("dashboard.useSuggestion", { level: severityLabel(suggestion, locale) })}
                  </button>
                )}
              </div>
            )}
            <div className="space-y-2 rounded-2xl border border-border p-3">
              <h3 className="text-sm font-semibold">{t("flow.team")}</h3>
              <PeopleLine incident={incident} />
              {incident.assignment?.investigationRequired && (
                <p className="text-xs">
                  {t("flow.investigationRequired")}: <strong>{t(`flow.st_${incident.assignment.investigationStatus}`)}</strong>
                  {incident.assignment.rootCause ? ` · ${incident.assignment.rootCause}` : ""}
                </p>
              )}
              {incident.assignment?.followUpStatus && (
                <p className="text-xs">
                  {t("flow.followUp")}: <strong>{t(`flow.fu_${incident.assignment.followUpStatus}`)}</strong>
                  {incident.assignment.followUpNote ? ` · ${incident.assignment.followUpNote}` : ""}
                </p>
              )}
              {can(viewerRole, "incident.assign") && <AssignPanel incident={incident} includeActionOwner={false} />}
            </div>
            {incident.outsideArea === true && (
              <p className={cn("rounded-lg border px-3 py-2 text-sm", panelClass.warning)}>
                {t("flag.outsideAreaDetail", { m: incident.distanceM ?? 0 })}
              </p>
            )}
            {severity === "unrated" && (
              <p className={cn("rounded-lg border px-3 py-2 text-sm font-medium", severityClass.unrated)}>{t("dashboard.pendingReviewHint")}</p>
            )}
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
            <Label>{t("dashboard.categoriesLabel")}</Label>
            <div className="flex flex-wrap gap-1.5">
              {riskChoices.map((id) => {
                const item = { id };
                const active = categories.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setCategories((current) => (active ? current.filter((id) => id !== item.id) : [...current, item.id]))}
                    className={cn(
                      "min-h-10 rounded-full border px-3 text-xs font-medium",
                      active ? "border-amber-500 bg-amber-500 text-slate-950" : "border-border bg-background text-muted-foreground"
                    )}
                  >
                    {categoryLabel(item.id, locale)}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">{t("dashboard.categoriesHint")}</p>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="assignee">{t("dashboard.assignee")}</Label>
            <select
              id="assignee"
              value={assigneeId}
              onChange={(event) => setAssigneeId(event.target.value)}
              className="h-12 w-full rounded-lg border border-border bg-background px-3"
            >
              <option value="">{t("dashboard.noOwner")}</option>
              {legacyOwner && <option value={legacyOwner.id}>{legacyOwner.name}</option>}
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.fullName} · {t(`roleNames.${person.role}`)}
                  {person.email ? "" : ` · ${t("dashboard.noEmailShort")}`}
                </option>
              ))}
            </select>
            {people.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {t("dashboard.noAssignable")}{" "}
                <Link href="/settings" className="font-semibold underline underline-offset-2">
                  {t("home.settings")}
                </Link>
              </p>
            )}
            <p className="text-xs text-muted-foreground">{t("dashboard.assigneeMailHint")}</p>
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
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="public-note">{t("dashboard.noteToReporter")}</Label>
            <Textarea
              id="public-note"
              value={publicNote}
              onChange={(event) => setPublicNote(event.target.value)}
              placeholder={t("dashboard.noteToReporterHint")}
              className="min-h-20"
            />
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button
          variant="outline"
          className="h-12 gap-2"
          onClick={() => void downloadIncidentPdf(incident, locale).catch(() => toast.error(t("toast.exportFailed")))}
        >
          <DownloadIcon className="size-4" />
          {t("buttons.downloadPdf")}
        </Button>
        <Button variant="outline" className="h-12" onClick={onClose}>
          {t("buttons.close")}
        </Button>
        <Button className="h-12" disabled={saving} onClick={() => void save()}>
          {saving ? t("buttons.saving") : t("buttons.saveCapa")}
        </Button>
      </DialogFooter>

      <AmlNoticeDialog incident={incident} site={site} open={amlOpen} onClose={() => setAmlOpen(false)} />
      <MeetingDialog incident={incident} open={meetingOpen} onClose={() => setMeetingOpen(false)} />
    </>
  );
}

/** Officer-side assistant: root causes, actions, AML advice. Stored on the incident. */
function AnalysisPanel({ incident }: { incident: Incident }) {
  const { locale, t } = useLanguage();
  const { saveIncidentAnalysis } = useIncidentStore();
  const [working, setWorking] = useState(false);
  const analysis = incident.aiAnalysis ?? null;

  async function run() {
    setWorking(true);
    try {
      const result = await analyzeIncident(incident, locale);
      await saveIncidentAnalysis(incident.id, result, locale);
    } catch (caught) {
      // Supabase errors are plain objects with a message, not Error instances.
      const message = (caught as { message?: unknown } | null)?.message;
      toast.error(typeof message === "string" && message ? message : t("analysis.failed"));
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className={cn("rounded-xl border p-4", panelClass.info)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold tracking-wide uppercase">
          <SparklesIcon className="size-4" />
          {t("analysis.title")}
        </h3>
        <Button type="button" variant="outline" size="sm" className="h-10 gap-2 bg-background/60" disabled={working} onClick={() => void run()}>
          {working ? <Loader2Icon className="size-4 animate-spin" /> : <SparklesIcon className="size-4" />}
          {working ? t("analysis.working") : analysis ? t("analysis.regenerate") : t("analysis.generate")}
        </Button>
      </div>

      {analysis && (
        <div className="mt-3 space-y-3 text-sm">
          <p className="leading-relaxed">{analysis.summary}</p>
          <div className="flex flex-wrap gap-2">
            <span className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", severityClass[analysis.riskLevel])}>
              {t("analysis.risk")}: {severityLabel(analysis.riskLevel, locale)}
            </span>
            <span className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", analysis.amlReportRequired ? panelClass.danger : panelClass.success)}>
              {t("analysis.aml")}: {analysis.amlReportRequired ? t("analysis.amlYes") : t("analysis.amlNo")}
            </span>
            <span className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", analysis.meetingRecommended ? panelClass.warning : "border-border")}>
              {analysis.meetingRecommended ? t("analysis.meetingYes") : t("analysis.meetingNo")}
            </span>
          </div>
          {analysis.amlReason && <p className="text-xs opacity-80">{analysis.amlReason}</p>}
          <AnalysisList title={t("analysis.rootCauses")} items={analysis.rootCauses} />
          <AnalysisList title={t("analysis.immediate")} items={analysis.immediateActions} />
          <AnalysisList title={t("analysis.preventive")} items={analysis.preventiveActions} />
          {analysis.meetingRecommended && <AnalysisList title={t("analysis.agenda")} items={analysis.meetingAgenda} />}
          <p className="text-xs opacity-70">
            {incident.aiAnalyzedAt ? t("analysis.generatedAt", { when: formatDateTime(incident.aiAnalyzedAt, locale) }) + " · " : ""}
            {t("analysis.disclaimer")}
          </p>
        </div>
      )}
    </div>
  );
}

function AnalysisList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-wide uppercase opacity-80">{title}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

/** Two Swedish business days from today, in Europe/Stockholm. */
function defaultDueDate() {
  return addBusinessDaysIsoDate(new Date(), 2);
}

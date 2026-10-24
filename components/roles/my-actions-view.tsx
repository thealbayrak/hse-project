"use client";

import { useMemo, useState } from "react";
import { CheckCircle2Icon, ImagePlusIcon, PlayIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, ReportCard, RoleHeader } from "@/components/roles/report-card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { can } from "@/lib/auth/permissions";
import { formatDate } from "@/lib/format";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { actionsFor } from "@/lib/roles/queries";
import { useIncidentStore } from "@/lib/store/incident-store";
import { panelClass } from "@/lib/tones";
import { cn } from "@/lib/utils";
import type { Incident } from "@/lib/types";

function ActionCard({ incident }: { incident: Incident }) {
  const { locale, t } = useLanguage();
  const { updateCapa, addResolutionProof, profile } = useIncidentStore();
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const capa = incident.capa;
  const assignment = incident.assignment;
  const done = incident.status === "resolved";
  const base = {
    assigneeId: capa?.assigneeId || profile?.id || "",
    assigneeName: capa?.assigneeName || profile?.fullName || "",
    dueDate: capa?.dueDate ?? "",
    notes: capa?.notes ?? "",
  };

  async function start() {
    setBusy(true);
    try {
      await updateCapa(incident.id, { ...base, status: "in-progress" });
    } catch (caught) {
      toast.error((caught as { message?: string })?.message ?? t("toast.capaFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function complete() {
    if (!files.length && !(incident.proofUrls?.length) && note.trim().length < 3) {
      toast.error(t("flow.needProofOrNote"));
      return;
    }
    setBusy(true);
    try {
      if (files.length) await addResolutionProof(incident.id, files);
      await updateCapa(incident.id, { ...base, status: "resolved", notes: [base.notes, note.trim()].filter(Boolean).join("\n") });
      setFiles([]);
      setNote("");
      toast.success(t("flow.completedToast"));
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
        assignment?.followUpStatus === "rejected"
          ? { text: t("flow.sentBackBadge"), tone: "danger" }
          : done
            ? { text: assignment?.followUpStatus === "approved" ? t("flow.approvedBadge") : t("flow.doneBadge"), tone: "success" }
            : undefined
      }
    >
      {capa?.dueDate && <p className="text-xs font-semibold">{t("flow.dueOn", { date: formatDate(capa.dueDate, locale) })}</p>}
      {assignment?.followUpStatus === "rejected" && (
        <p className={cn("rounded-lg border px-3 py-2 text-sm", panelClass.danger)}>{t("flow.sentBack", { note: assignment.followUpNote ?? "" })}</p>
      )}
      {done && assignment?.followUpStatus === "pending" && (
        <p className={cn("rounded-lg border px-3 py-2 text-sm", panelClass.info)}>{t("flow.waitingCheck", { name: assignment.followUpName ?? "—" })}</p>
      )}
      {!!incident.proofUrls?.length && (
        <div className="flex gap-2">
          {incident.proofUrls.slice(0, 4).map((url, index) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={url.slice(0, 40) + index} src={url} alt={t("flow.proof")} className="size-16 rounded-lg object-cover ring-2 ring-emerald-500/50" />
          ))}
        </div>
      )}

      {!done || assignment?.followUpStatus === "rejected" ? (
        <div className="space-y-3 rounded-2xl border border-border bg-background/60 p-3">
          {incident.status === "open" && (
            <Button type="button" variant="outline" className="h-11 gap-2" disabled={busy} onClick={() => void start()}>
              <PlayIcon className="size-4" />
              {t("flow.start")}
            </Button>
          )}
          <label className="block space-y-1.5 text-sm font-medium">
            {t("flow.whatWasDone")}
            <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={t("flow.whatWasDonePh")} className="min-h-20" />
          </label>
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("flow.proof")}</p>
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 text-sm">
              <ImagePlusIcon className="size-4" />
              {t("flow.addPhoto")}
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(event) => setFiles((current) => [...current, ...Array.from(event.target.files ?? [])].slice(0, 4))}
              />
            </label>
            {files.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {files.map((file, index) => (
                  <li key={file.name + index} className="flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs">
                    {file.name}
                    <button type="button" aria-label={t("flow.remove")} onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}>
                      <XIcon className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Button type="button" className="h-12 w-full gap-2 sm:w-auto" disabled={busy} onClick={() => void complete()}>
            <CheckCircle2Icon className="size-4" />
            {busy ? t("flow.saving") : t("flow.markCompleted")}
          </Button>
        </div>
      ) : null}
    </ReportCard>
  );
}

/** The action owner's page: only the repairs given to them, with proof of the fix. */
export function MyActionsView() {
  const { t } = useLanguage();
  const { incidents, profile, role } = useIncidentStore();
  const allowed = can(role, "actions.work");
  const mine = useMemo(() => actionsFor(incidents, profile?.id), [incidents, profile]);
  const open = mine.filter((incident) => incident.status !== "resolved" || incident.assignment?.followUpStatus === "rejected");
  const finished = mine.filter((incident) => !open.includes(incident));

  if (!allowed) return <p className={cn("rounded-xl border px-4 py-3 text-sm", panelClass.warning)}>{t("flow.notAllowed")}</p>;

  return (
    <div className="space-y-5">
      <RoleHeader eyebrow={t("roleNames.action_owner")} title={t("flow.myActionsTitle")} hint={t("flow.myActionsHint")} />
      <h2 className="text-lg font-semibold">{t("flow.toDo", { n: open.length })}</h2>
      {open.length === 0 ? <EmptyState text={t("flow.nothingHere")} /> : <div className="space-y-3">{open.map((incident) => <ActionCard key={incident.id} incident={incident} />)}</div>}
      {finished.length > 0 && (
        <>
          <h2 className="text-lg font-semibold">{t("flow.finished", { n: finished.length })}</h2>
          <div className="space-y-3">{finished.map((incident) => <ActionCard key={incident.id} incident={incident} />)}</div>
        </>
      )}
    </div>
  );
}

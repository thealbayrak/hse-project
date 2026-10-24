"use client";

import { useMemo, useState } from "react";
import { CheckIcon, Undo2Icon } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, ReportCard, RoleHeader } from "@/components/roles/report-card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { can } from "@/lib/auth/permissions";
import { formatDate } from "@/lib/format";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { awaitingVerification, verifiedBy } from "@/lib/roles/queries";
import { useIncidentStore } from "@/lib/store/incident-store";
import { panelClass } from "@/lib/tones";
import { cn } from "@/lib/utils";
import type { Incident } from "@/lib/types";

function VerifyCard({ incident, decided }: { incident: Incident; decided: boolean }) {
  const { locale, t } = useLanguage();
  const { verifyFollowUp } = useIncidentStore();
  const [reason, setReason] = useState("");
  const [sendingBack, setSendingBack] = useState(false);
  const [busy, setBusy] = useState(false);
  const a = incident.assignment;

  async function decide(approved: boolean) {
    if (!approved && reason.trim().length < 3) {
      toast.error(t("flow.reasonNeeded"));
      return;
    }
    setBusy(true);
    try {
      await verifyFollowUp({ incidentId: incident.id, approved, note: reason });
      toast.success(approved ? t("flow.approvedToast") : t("flow.sentBackToast"));
      setReason("");
      setSendingBack(false);
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
        a?.followUpStatus === "approved"
          ? { text: t("flow.approvedBadge"), tone: "success" }
          : a?.followUpStatus === "rejected"
            ? { text: t("flow.sentBackBadge"), tone: "danger" }
            : { text: t("flow.toCheck"), tone: "info" }
      }
    >
      <div className="space-y-2 rounded-2xl border border-border bg-background/60 p-3">
        <p className="text-sm font-semibold">{t("flow.ownerSays", { name: a?.actionOwnerName ?? incident.capa?.assigneeName ?? "—" })}</p>
        <p className="text-sm whitespace-pre-line">{incident.capa?.notes || t("flow.noNote")}</p>
        {!!incident.proofUrls?.length && (
          <div className="flex gap-2">
            {incident.proofUrls.slice(0, 4).map((url, index) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={url.slice(0, 40) + index} src={url} alt={t("flow.proof")} className="size-24 rounded-lg object-cover ring-2 ring-emerald-500/50" />
            ))}
          </div>
        )}
        {decided && a?.verifiedAt && (
          <p className="text-xs text-muted-foreground">
            {t("flow.checkedOn", { date: formatDate(a.verifiedAt, locale) })}
            {a.followUpNote ? ` · ${a.followUpNote}` : ""}
          </p>
        )}
      </div>

      {!decided && (
        <div className="space-y-2">
          {sendingBack ? (
            <>
              <label className="block space-y-1.5 text-sm font-medium">
                {t("flow.whatIsMissing")}
                <Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("flow.reasonPh")} className="min-h-20" />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="destructive" className="h-12 gap-2" disabled={busy} onClick={() => void decide(false)}>
                  <Undo2Icon className="size-4" />
                  {t("flow.sendBack")}
                </Button>
                <Button type="button" variant="outline" className="h-12" disabled={busy} onClick={() => setSendingBack(false)}>
                  {t("flow.cancel")}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button type="button" className="h-12 gap-2" disabled={busy} onClick={() => void decide(true)}>
                <CheckIcon className="size-4" />
                {t("flow.approve")}
              </Button>
              <Button type="button" variant="outline" className="h-12 gap-2" disabled={busy} onClick={() => setSendingBack(true)}>
                <Undo2Icon className="size-4" />
                {t("flow.sendBack")}
              </Button>
            </div>
          )}
        </div>
      )}
    </ReportCard>
  );
}

/** The follow-up person's page: finished repairs to check, with the owner's note and proof photos. */
export function FollowUpsView() {
  const { t } = useLanguage();
  const { incidents, profile, role } = useIncidentStore();
  const allowed = can(role, "followups.review");
  const seesAll = role !== "follow_up";
  const pending = useMemo(() => awaitingVerification(incidents, profile?.id, seesAll), [incidents, profile, seesAll]);
  const decided = useMemo(() => verifiedBy(incidents, profile?.id, seesAll), [incidents, profile, seesAll]);

  if (!allowed) return <p className={cn("rounded-xl border px-4 py-3 text-sm", panelClass.warning)}>{t("flow.notAllowed")}</p>;

  return (
    <div className="space-y-5">
      <RoleHeader eyebrow={t("roleNames.follow_up")} title={t("flow.fuTitle")} hint={t("flow.fuHint")} />
      <h2 className="text-lg font-semibold">{t("flow.toVerify", { n: pending.length })}</h2>
      {pending.length === 0 ? <EmptyState text={t("flow.nothingHere")} /> : <div className="space-y-3">{pending.map((incident) => <VerifyCard key={incident.id} incident={incident} decided={false} />)}</div>}
      {decided.length > 0 && (
        <>
          <h2 className="text-lg font-semibold">{t("flow.checked", { n: decided.length })}</h2>
          <div className="space-y-3">{decided.map((incident) => <VerifyCard key={incident.id} incident={incident} decided />)}</div>
        </>
      )}
    </div>
  );
}

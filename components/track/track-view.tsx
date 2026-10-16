"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2Icon, CircleDashedIcon, MessageSquareTextIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate, formatDateTime, severityLabel } from "@/lib/format";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useIncidentStore } from "@/lib/store/incident-store";
import { panelClass, severityClass } from "@/lib/tones";
import { cn } from "@/lib/utils";
import type { TrackedIncident } from "@/lib/types";

export function TrackView() {
  const { t } = useLanguage();
  const { trackIncident } = useIncidentStore();
  const searchParams = useSearchParams();
  const [code, setCode] = useState(() => searchParams.get("code") ?? "");
  const [result, setResult] = useState<TrackedIncident | null | "none">(null);
  const [busy, setBusy] = useState(false);

  async function lookup(event?: React.FormEvent) {
    event?.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    try {
      const found = await trackIncident(code);
      setResult(found ?? "none");
    } catch {
      setResult("none");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-5">
      <div className="rounded-3xl border border-border bg-card px-5 py-7 sm:px-8">
        <p className="text-xs font-semibold tracking-[0.18em] text-amber-700 uppercase dark:text-amber-400">
          {t("roles.workerEyebrow")}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t("track.title")}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("track.body")}</p>

        <form onSubmit={(event) => void lookup(event)} className="mt-5 space-y-3">
          <Label htmlFor="track-code">{t("track.codeLabel")}</Label>
          <Input
            id="track-code"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="K7FP-3M2X"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className="h-14 font-mono text-lg tracking-widest"
          />
          <Button type="submit" className="h-14 w-full gap-2 text-base" disabled={busy || !code.trim()}>
            <SearchIcon className="size-4" />
            {busy ? t("track.checking") : t("track.lookup")}
          </Button>
        </form>
      </div>

      {result === "none" && (
        <p className={cn("rounded-2xl border px-4 py-3 text-sm", panelClass.warning)}>{t("track.notFound")}</p>
      )}

      {result && result !== "none" && <TrackResult tracked={result} />}
    </div>
  );
}

function TrackResult({ tracked }: { tracked: TrackedIncident }) {
  const { locale, t } = useLanguage();
  const steps = [
    { key: "received", label: t("track.received"), done: true, when: formatDateTime(tracked.createdAt, locale) },
    {
      key: "owner",
      label: tracked.hasOwner ? t("track.ownerAssigned") : t("track.waitingOwner"),
      done: tracked.hasOwner,
      when: tracked.dueDate ? t("track.dueBy", { date: formatDate(`${tracked.dueDate}T12:00:00`, locale) }) : null,
    },
    {
      key: "progress",
      label: t("track.inProgress"),
      done: tracked.status === "in-progress" || tracked.status === "resolved",
      when: null,
    },
    {
      key: "resolved",
      label: t("track.resolved"),
      done: tracked.status === "resolved",
      when: tracked.status === "resolved" && tracked.updatedAt ? formatDateTime(tracked.updatedAt, locale) : null,
    },
  ];

  return (
    <div className="space-y-4 rounded-3xl border border-border bg-card px-5 py-6 sm:px-8">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm text-amber-700 dark:text-amber-300">{tracked.reference}</span>
        <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium", severityClass[tracked.severity])}>
          {severityLabel(tracked.severity, locale)}
        </span>
      </div>

      <ol className="space-y-3">
        {steps.map((step) => (
          <li key={step.key} className="flex items-start gap-3">
            {step.done ? (
              <CheckCircle2Icon className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <CircleDashedIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            )}
            <div>
              <p className={cn("text-sm font-medium", !step.done && "text-muted-foreground")}>{step.label}</p>
              {step.when && <p className="text-xs text-muted-foreground">{step.when}</p>}
            </div>
          </li>
        ))}
      </ol>

      <div className={cn("flex gap-3 rounded-2xl border p-4", panelClass.info)}>
        <MessageSquareTextIcon className="mt-0.5 size-5 shrink-0" />
        <div>
          <p className="text-sm font-semibold">{t("track.noteTitle")}</p>
          <p className="mt-1 text-sm leading-relaxed opacity-85 whitespace-pre-line">
            {tracked.publicNote || t("track.noNote")}
          </p>
        </div>
      </div>
    </div>
  );
}

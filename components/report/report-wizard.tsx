"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckIcon,
  CloudOffIcon,
  ImagePlusIcon,
  MicIcon,
  ShieldOffIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { StatutoryBanner } from "@/components/layout/statutory-banner";
import { useVoiceCapture } from "@/hooks/use-voice-capture";
import {
  DEFAULT_REPORTER_NAME,
  INCIDENT_TYPES,
  RISK_CATEGORIES,
  SEVERITY_LEVELS,
} from "@/lib/constants";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { isImageFile } from "@/lib/media";
import { useIncidentStore } from "@/lib/store/incident-store";
import { categoryLabel, severityLabel, typeLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { severityClass } from "@/lib/tones";
import type { IncidentType, ReportDraft } from "@/lib/types";

const TYPE_HINT: Record<IncidentType, string> = {
  "near-miss": "incident.nearMissHint",
  hazard: "incident.hazardHint",
  accident: "incident.accidentHint",
};

const STEP_KEYS = ["report.stepWhat", "report.stepDetails", "report.stepReview"] as const;
const STEP_SHORT_KEYS = ["report.stepWhatShort", "report.stepDetailsShort", "report.stepReviewShort"] as const;

const EMPTY_DRAFT: ReportDraft = {
  type: null,
  siteId: "",
  locationId: "",
  category: null,
  severity: null,
  description: "",
  mediaUrls: [],
  photoFiles: [],
  audioFile: null,
  anonymous: false,
};

export function ReportWizard() {
  const router = useRouter();
  const { locale, t } = useLanguage();
  const { sites, createIncident, loading, error } = useIncidentStore();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<ReportDraft>(EMPTY_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ reference: string; pending: boolean } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const descriptionAnchor = useRef("");

  const voice = useVoiceCapture((text) => {
    const base = descriptionAnchor.current;
    patch({ description: [base, text].filter(Boolean).join(" ") });
  }, locale);

  const selectedSite = sites.find((site) => site.id === draft.siteId);
  const locations = selectedSite?.locations ?? [];
  const selectedLocation = locations.find((location) => location.id === draft.locationId);

  const step1Ready = Boolean(draft.type && draft.siteId && draft.locationId && draft.category && draft.severity);
  const step2Ready = draft.description.trim().length >= 8;

  function patch(next: Partial<ReportDraft>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  async function addFiles(files: FileList | File[]) {
    const images = Array.from(files).filter(isImageFile);
    if (!images.length) {
      toast.error(t("toast.photoNeeded"));
      return;
    }
    const urls = await Promise.all(
      images.map(
        (file) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new Error("Could not read photo"));
            reader.readAsDataURL(file);
          })
      )
    );
    setDraft((current) => ({
      ...current,
      mediaUrls: [...current.mediaUrls, ...urls].slice(0, 4),
      photoFiles: [...current.photoFiles, ...images].slice(0, 4),
    }));
  }

  async function toggleVoice() {
    if (!voice.supported) {
      toast.error(t("toast.voiceUnavailable"));
      return;
    }
    if (voice.recording) {
      await voice.toggle();
      toast.success(t("toast.voiceCaptured"));
      return;
    }
    descriptionAnchor.current = draft.description.trim();
    try {
      await voice.toggle();
    } catch {
      toast.error(t("toast.micNeeded"));
    }
  }

  async function submit() {
    if (!draft.type || !draft.category || !draft.severity) return;
    setSubmitting(true);
    try {
      const created = await createIncident({
        type: draft.type,
        siteId: draft.siteId,
        locationId: draft.locationId,
        category: draft.category,
        severity: draft.severity,
        description: draft.description.trim(),
        mediaUrls: draft.mediaUrls,
        photoFiles: draft.photoFiles,
        audioFile: voice.audioBlob ?? draft.audioFile,
        anonymous: draft.anonymous,
        reporterName: draft.anonymous ? null : DEFAULT_REPORTER_NAME,
      });
      setSubmitted({ reference: created.reference, pending: Boolean(created.pending) });
      toast.success(created.pending ? t("offline.queued") : t("toast.reportReceived"));
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : t("toast.reportFailed");
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-xl space-y-5">
        <StatutoryBanner />
        <div
          className={cn(
            "rounded-2xl border p-6 text-center",
            submitted.pending
              ? "border-amber-500/30 bg-amber-950/40"
              : "border-emerald-500/30 bg-emerald-950/40"
          )}
        >
          <div
            className={cn(
              "mx-auto mb-4 flex size-14 items-center justify-center rounded-full text-slate-950",
              submitted.pending ? "bg-amber-400" : "bg-emerald-500"
            )}
          >
            {submitted.pending ? <CloudOffIcon className="size-7" /> : <CheckIcon className="size-7" />}
          </div>
          <h2 className="text-2xl font-semibold">
            {submitted.pending ? t("offline.queued") : t("report.received")}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {submitted.pending ? t("offline.queuedBody") : t("report.thankYou")}
          </p>
          {!submitted.pending && (
            <p className="mt-4 font-mono text-lg text-amber-300">{submitted.reference}</p>
          )}
          {draft.severity === "critical" && (
            <p className="mt-4 rounded-xl bg-red-950/60 px-4 py-3 text-sm text-red-100">
              {t("statutory.criticalNow")}
            </p>
          )}
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Button
              className="h-14 text-base"
              variant="outline"
              onClick={() => {
                setDraft(EMPTY_DRAFT);
                setSubmitted(null);
                setStep(0);
                voice.clearAudio();
              }}
            >
              {t("buttons.reportAnother")}
            </Button>
            <Button className="h-14 text-base" onClick={() => router.push("/")}>
              {t("buttons.done")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <StatutoryBanner />
      {error && (
        <p className="rounded-xl border border-amber-500/40 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
          {error}
        </p>
      )}

      <ol className="grid grid-cols-3 gap-2">
        {STEP_KEYS.map((key, index) => {
          const current = index === step;
          const done = index < step;
          return (
            <li
              key={key}
              className={cn(
                "min-w-0 rounded-xl border px-1 py-3 text-center sm:px-2",
                current && "border-amber-400/50 bg-amber-500/10",
                done && "border-emerald-500/30 bg-emerald-500/10",
                !current && !done && "border-border bg-card/50"
              )}
            >
              <span className="block text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                {t("report.step", { n: index + 1 })}
              </span>
              <span className="mt-1 block text-xs font-medium sm:text-sm">
                <span className="sm:hidden">{t(STEP_SHORT_KEYS[index])}</span>
                <span className="hidden sm:inline">{t(key)}</span>
              </span>
            </li>
          );
        })}
      </ol>

      {step === 0 && (
        <section className="space-y-6">
          <fieldset>
            <legend className="mb-3 text-lg font-semibold">{t("incident.whatToReport")}</legend>
            <div className="grid gap-3">
              {INCIDENT_TYPES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => patch({ type: item.id })}
                  className={cn(
                    "min-h-20 rounded-2xl border px-4 py-4 text-left transition-colors",
                    draft.type === item.id
                      ? "border-amber-400 bg-amber-500/15 ring-2 ring-amber-400/40"
                      : "border-border bg-card hover:bg-secondary/60"
                  )}
                >
                  <span className="block text-base font-semibold">{typeLabel(item.id, locale)}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{t(TYPE_HINT[item.id])}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-3 text-lg font-semibold">{t("incident.where")}</legend>
            {loading && !sites.length && (
              <p className="mb-3 text-sm text-muted-foreground">{t("report.loadingSites")}</p>
            )}
            <div className="grid gap-2">
              {sites.map((site) => (
                <button
                  key={site.id}
                  type="button"
                  onClick={() =>
                    patch({
                      siteId: site.id,
                      locationId: site.locations.length === 1 ? site.locations[0].id : "",
                    })
                  }
                  className={cn(
                    "min-h-14 rounded-xl border px-4 py-3 text-left",
                    draft.siteId === site.id
                      ? "border-amber-400 bg-amber-500/15"
                      : "border-border bg-card hover:bg-secondary/60"
                  )}
                >
                  <span className="block font-medium">{site.name}</span>
                  <span className="text-xs text-muted-foreground">{site.city}</span>
                </button>
              ))}
            </div>
            {!!locations.length && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {locations.map((location) => (
                  <button
                    key={location.id}
                    type="button"
                    onClick={() => patch({ locationId: location.id })}
                    className={cn(
                      "min-h-14 rounded-xl border px-3 py-3 text-left text-sm font-medium",
                      draft.locationId === location.id
                        ? "border-amber-400 bg-amber-500/15"
                        : "border-border bg-card hover:bg-secondary/60"
                    )}
                  >
                    {location.name}
                  </button>
                ))}
              </div>
            )}
          </fieldset>

          <fieldset>
            <legend className="mb-3 text-lg font-semibold">{t("incident.whatRisk")}</legend>
            <div className="flex flex-wrap gap-2">
              {RISK_CATEGORIES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => patch({ category: item.id })}
                  className={cn(
                    "min-h-12 rounded-full border px-4 text-sm font-medium",
                    draft.category === item.id
                      ? "border-amber-400 bg-amber-500 text-slate-950"
                      : "border-border bg-card text-foreground hover:bg-secondary/60"
                  )}
                >
                  {categoryLabel(item.id, locale)}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-3 text-lg font-semibold">{t("incident.howSerious")}</legend>
            <div className="grid grid-cols-2 gap-2">
              {SEVERITY_LEVELS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => patch({ severity: item.id })}
                  className={cn(
                    "min-h-20 rounded-2xl border px-3 py-3 text-left",
                    draft.severity === item.id
                      ? cn("ring-2", severityClass[item.id], "ring-current/30")
                      : "border-border bg-card hover:bg-secondary/60"
                  )}
                >
                  <span className="block font-semibold">{severityLabel(item.id, locale)}</span>
                  <span className="text-xs text-muted-foreground">{t(`severity.${item.id}Hint`)}</span>
                </button>
              ))}
            </div>
          </fieldset>
        </section>
      )}

      {step === 1 && (
        <section className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold">{t("report.addPhoto")}</h2>
            <p className="mb-3 text-sm text-muted-foreground">{t("report.addPhotoHint")}</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.heic,.heif"
              multiple
              className="sr-only"
              onChange={(event) => {
                if (event.target.files) void addFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragOver(false);
                void addFiles(event.dataTransfer.files);
              }}
              className={cn(
                "flex min-h-36 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 text-center",
                dragOver ? "border-amber-400 bg-amber-500/10" : "border-border bg-card"
              )}
            >
              <ImagePlusIcon className="mb-2 size-8 text-amber-400" />
              <span className="font-medium">{t("report.dropPhoto")}</span>
              <span className="text-sm text-muted-foreground">{t("report.tapCamera")}</span>
            </button>
            {!!draft.mediaUrls.length && (
              <div className="mt-3 grid grid-cols-4 gap-2">
                {draft.mediaUrls.map((url, index) => (
                  <div key={url.slice(0, 24) + index} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`Photo ${index + 1}`}
                      className="h-20 w-full rounded-lg object-cover"
                    />
                    <button
                      type="button"
                      className="absolute -top-1.5 -right-1.5 flex size-8 items-center justify-center rounded-full bg-slate-950 text-white"
                      onClick={() =>
                        patch({
                          mediaUrls: draft.mediaUrls.filter((_, i) => i !== index),
                          photoFiles: draft.photoFiles.filter((_, i) => i !== index),
                        })
                      }
                    >
                      <XIcon className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{t("report.whatHappened")}</h2>
              <Button
                type="button"
                variant="outline"
                className="h-12 gap-2 px-3"
                onClick={() => void toggleVoice()}
              >
                {voice.recording ? (
                  <SparklesIcon className="size-4 animate-pulse" />
                ) : (
                  <MicIcon className="size-4" />
                )}
                {voice.recording ? t("buttons.listening") : t("buttons.recordVoice")}
              </Button>
            </div>
            <Textarea
              value={draft.description}
              onChange={(event) => patch({ description: event.target.value })}
              placeholder={t("report.placeholder")}
              className="min-h-40 text-base"
            />
            {(voice.audioBlob || voice.recording) && (
              <p className="mt-2 text-xs text-muted-foreground">
                {voice.recording ? t("report.recordingNote") : t("report.voiceAttached")}
              </p>
            )}
          </div>

          <label className="flex min-h-16 items-center justify-between gap-4 rounded-2xl border border-border bg-card px-4 py-3">
            <span className="flex items-start gap-3">
              <ShieldOffIcon className="mt-0.5 size-5 text-amber-400" />
              <span>
                <span className="block font-medium">{t("report.anonymous")}</span>
                <span className="text-sm text-muted-foreground">{t("report.anonymousHint")}</span>
              </span>
            </span>
            <Switch
              checked={draft.anonymous}
              onCheckedChange={(checked) => patch({ anonymous: checked })}
              className="h-7 w-12"
            />
          </label>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">{t("report.checkLooksRight")}</h2>
          <ReviewRow label={t("report.type")} value={draft.type ? typeLabel(draft.type, locale) : "—"} />
          <ReviewRow
            label={t("report.place")}
            value={
              selectedSite && selectedLocation
                ? `${selectedLocation.name} · ${selectedSite.name}`
                : "—"
            }
          />
          <ReviewRow
            label={t("report.risk")}
            value={draft.category ? categoryLabel(draft.category, locale) : "—"}
          />
          <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
            <span className="text-sm text-muted-foreground">{t("report.severity")}</span>
            {draft.severity && (
              <span className={cn("rounded-full border px-3 py-1 text-sm font-medium", severityClass[draft.severity])}>
                {severityLabel(draft.severity, locale)}
              </span>
            )}
          </div>
          <ReviewRow
            label={t("report.reporter")}
            value={draft.anonymous ? t("report.anonymousPerson") : DEFAULT_REPORTER_NAME}
          />
          <div className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-sm text-muted-foreground">{t("report.description")}</p>
            <p className="mt-1 text-sm leading-relaxed">{draft.description}</p>
          </div>
          {!!draft.mediaUrls.length && (
            <div className="grid grid-cols-4 gap-2">
              {draft.mediaUrls.map((url, index) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={url.slice(0, 24) + index}
                  src={url}
                  alt={`Attached photo ${index + 1}`}
                  className="h-20 w-full rounded-lg object-cover"
                />
              ))}
            </div>
          )}
          {draft.severity === "critical" && (
            <p className="rounded-xl border border-red-500/40 bg-red-950/50 px-4 py-3 text-sm text-red-100">
              {t("statutory.criticalCheck")}
            </p>
          )}
        </section>
      )}

      <div className="app-wizard-actions sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-20 grid grid-cols-2 gap-3 bg-background/90 py-3 backdrop-blur md:bottom-4">
        <Button
          type="button"
          variant="outline"
          className="h-14 text-base"
          onClick={() => setStep((current) => Math.max(0, current - 1))}
          disabled={step === 0}
        >
          {t("buttons.back")}
        </Button>
        {step < 2 ? (
          <Button
            type="button"
            className="h-14 text-base"
            disabled={(step === 0 && !step1Ready) || (step === 1 && !step2Ready)}
            onClick={() => setStep((current) => current + 1)}
          >
            {t("buttons.continue")}
          </Button>
        ) : (
          <Button
            type="button"
            className="h-14 text-base"
            disabled={submitting || !step1Ready || !step2Ready}
            onClick={() => void submit()}
          >
            {submitting
              ? t("buttons.sending")
              : draft.type === "hazard"
                ? t("buttons.submitHazard")
                : t("buttons.sendReport")}
          </Button>
        )}
      </div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium">{value}</span>
    </div>
  );
}

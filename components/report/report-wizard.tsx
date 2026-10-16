"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  CheckIcon,
  CloudOffIcon,
  EyeOffIcon,
  HistoryIcon,
  ImagePlusIcon,
  MicIcon,
  ShieldCheckIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { StatutoryBanner } from "@/components/layout/statutory-banner";
import { useVoiceCapture } from "@/hooks/use-voice-capture";
import { DEFAULT_REPORTER_NAME, INCIDENT_TYPES, RISK_CATEGORIES } from "@/lib/constants";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { isImageFile } from "@/lib/media";
import { readLastSite, rememberLastSite, serverLastSite, subscribeLastSite } from "@/lib/report/last-site";
import { deriveSeverity } from "@/lib/report/severity";
import { useIncidentStore } from "@/lib/store/incident-store";
import { categoryLabel, severityLabel, typeLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { panelClass, severityClass } from "@/lib/tones";
import type { IncidentType, ReportDraft } from "@/lib/types";

const TYPE_HINT: Record<IncidentType, string> = {
  "near-miss": "incident.nearMissHint",
  hazard: "incident.hazardHint",
  accident: "incident.accidentHint",
};

const STEP_KEYS = ["report.stepWhat", "report.stepDetails", "report.stepReview"] as const;
const STEP_SHORT_KEYS = ["report.stepWhatShort", "report.stepDetailsShort", "report.stepReviewShort"] as const;

interface Draft extends Omit<ReportDraft, "severity"> {
  hurt: boolean | null;
  danger: boolean | null;
}

const EMPTY_DRAFT: Draft = {
  type: null,
  siteId: "",
  locationId: "",
  category: null,
  hurt: null,
  danger: null,
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
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ reference: string; pending: boolean } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const descriptionAnchor = useRef("");
  const lastSite = useSyncExternalStore(subscribeLastSite, readLastSite, serverLastSite);

  const voice = useVoiceCapture((text) => {
    const base = descriptionAnchor.current;
    patch({ description: [base, text].filter(Boolean).join(" ") });
  }, locale);

  // The last-used site comes first and is pre-selected until the worker picks another.
  const orderedSites = lastSite
    ? [...sites].sort((a, b) => Number(b.id === lastSite.siteId) - Number(a.id === lastSite.siteId))
    : sites;
  const siteId = draft.siteId || (lastSite && sites.some((site) => site.id === lastSite.siteId) ? lastSite.siteId : "");
  const selectedSite = sites.find((site) => site.id === siteId);
  const locations = selectedSite?.locations ?? [];
  const locationId =
    draft.locationId ||
    (locations.length === 1
      ? locations[0].id
      : lastSite && lastSite.siteId === siteId && locations.some((item) => item.id === lastSite.locationId)
        ? lastSite.locationId
        : "");
  const selectedLocation = locations.find((location) => location.id === locationId);

  const severity = draft.type ? deriveSeverity(draft.type, draft) : null;
  const step1Ready = Boolean(draft.type && siteId && locationId);
  const step2Ready = Boolean(severity && draft.category && draft.description.trim().length >= 8);

  function patch(next: Partial<Draft>) {
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
    if (!draft.type || !draft.category || !severity || !siteId || !locationId) return;
    setSubmitting(true);
    try {
      const created = await createIncident({
        type: draft.type,
        siteId,
        locationId,
        category: draft.category,
        severity,
        description: draft.description.trim(),
        mediaUrls: draft.mediaUrls,
        photoFiles: draft.photoFiles,
        audioFile: voice.audioBlob ?? draft.audioFile,
        anonymous: draft.anonymous,
        reporterName: draft.anonymous ? null : DEFAULT_REPORTER_NAME,
      });
      rememberLastSite({ siteId, locationId });
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
        <div className={cn("rounded-2xl border p-6 text-center", submitted.pending ? panelClass.warning : panelClass.success)}>
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
          <p className="mt-2 text-sm opacity-80">
            {submitted.pending ? t("offline.queuedBody") : t("report.thankYou")}
          </p>
          {!submitted.pending && (
            <p className="mt-4 font-mono text-lg text-amber-700 dark:text-amber-300">{submitted.reference}</p>
          )}
          {severity === "critical" && (
            <p className={cn("mt-4 rounded-xl border px-4 py-3 text-sm", panelClass.danger)}>
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
        <StatutoryBanner compact />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      {error && <p className={cn("rounded-xl border px-4 py-3 text-sm", panelClass.warning)}>{error}</p>}

      <ol className="grid grid-cols-3 gap-2" aria-label={t("report.step", { n: step + 1 })}>
        {STEP_KEYS.map((key, index) => {
          const current = index === step;
          const done = index < step;
          return (
            <li
              key={key}
              aria-current={current ? "step" : undefined}
              className={cn(
                "min-w-0 rounded-xl border px-1 py-2.5 text-center sm:px-2",
                current && "border-amber-500/60 bg-amber-500/10",
                done && "border-emerald-500/40 bg-emerald-500/10",
                !current && !done && "border-border bg-card/50"
              )}
            >
              <span className="block text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                {t("report.step", { n: index + 1 })}
              </span>
              <span className="mt-0.5 block text-xs font-medium sm:text-sm">
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
                <ChoiceButton
                  key={item.id}
                  active={draft.type === item.id}
                  onClick={() => patch({ type: item.id })}
                  className="min-h-[4.5rem]"
                >
                  <span className="block text-base font-semibold">{typeLabel(item.id, locale)}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{t(TYPE_HINT[item.id])}</span>
                </ChoiceButton>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-3 text-lg font-semibold">{t("incident.where")}</legend>
            {loading && !sites.length && (
              <p className="mb-3 text-sm text-muted-foreground">{t("report.loadingSites")}</p>
            )}
            <div className="grid gap-2">
              {orderedSites.map((site) => (
                <ChoiceButton
                  key={site.id}
                  active={siteId === site.id}
                  onClick={() => patch({ siteId: site.id, locationId: "" })}
                  className="min-h-14 py-3"
                >
                  <span className="flex items-center gap-2">
                    <span className="block font-medium">{site.name}</span>
                    {lastSite?.siteId === site.id && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                        <HistoryIcon className="size-3" />
                        {t("report.lastUsed")}
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">{site.city}</span>
                </ChoiceButton>
              ))}
            </div>
            {locations.length > 1 && (
              <>
                <p className="mt-4 mb-2 text-sm font-medium">{t("incident.whichArea")}</p>
                <div className="grid grid-cols-2 gap-2">
                  {locations.map((location) => (
                    <ChoiceButton
                      key={location.id}
                      active={locationId === location.id}
                      onClick={() => patch({ locationId: location.id })}
                      className="min-h-14 px-3 py-3 text-sm font-medium"
                    >
                      {location.name}
                    </ChoiceButton>
                  ))}
                </div>
              </>
            )}
          </fieldset>
        </section>
      )}

      {step === 1 && (
        <section className="space-y-6">
          <fieldset>
            <legend className="mb-1 text-lg font-semibold">{t("incident.howSerious")}</legend>
            <p className="mb-3 text-sm text-muted-foreground">{t("report.answerBoth")}</p>
            <div className="space-y-3">
              <YesNoQuestion
                label={t("report.hurtQuestion")}
                value={draft.hurt}
                onChange={(hurt) => patch({ hurt })}
                yes={t("buttons.yes")}
                no={t("buttons.no")}
              />
              <YesNoQuestion
                label={t("report.dangerQuestion")}
                value={draft.danger}
                onChange={(danger) => patch({ danger })}
                yes={t("buttons.yes")}
                no={t("buttons.no")}
              />
            </div>
            {severity && (
              <p className={cn("mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm", severityClass[severity])}>
                <ShieldCheckIcon className="size-4" />
                {t("report.severityDerived", { level: severityLabel(severity, locale) })}
              </p>
            )}
          </fieldset>

          <fieldset>
            <legend className="mb-3 text-lg font-semibold">{t("incident.whatRisk")}</legend>
            <div className="grid grid-cols-2 gap-2">
              {RISK_CATEGORIES.map((item) => (
                <ChoiceButton
                  key={item.id}
                  active={draft.category === item.id}
                  onClick={() => patch({ category: item.id })}
                  className="min-h-14 px-3 py-3 text-sm font-medium"
                >
                  {categoryLabel(item.id, locale)}
                </ChoiceButton>
              ))}
            </div>
          </fieldset>

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
              className="min-h-36 text-base"
            />
            {(voice.audioBlob || voice.recording) && (
              <p className="mt-2 text-xs text-muted-foreground">
                {voice.recording ? t("report.recordingNote") : t("report.voiceAttached")}
              </p>
            )}
          </div>

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
                "flex min-h-28 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 text-center",
                dragOver ? "border-amber-500 bg-amber-500/10" : "border-border bg-card"
              )}
            >
              <ImagePlusIcon className="mb-2 size-7 text-amber-600 dark:text-amber-400" />
              <span className="font-medium">{t("report.dropPhoto")}</span>
              <span className="text-sm text-muted-foreground">{t("report.tapCamera")}</span>
            </button>
            {!!draft.mediaUrls.length && (
              <div className="mt-3 grid grid-cols-4 gap-2">
                {draft.mediaUrls.map((url, index) => (
                  <div key={url.slice(0, 24) + index} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`Photo ${index + 1}`} className="h-20 w-full rounded-lg object-cover" />
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

          <div className={cn("rounded-2xl border p-4", panelClass.info)}>
            <label className="flex min-h-12 items-center justify-between gap-4">
              <span className="flex items-start gap-3">
                <EyeOffIcon className="mt-0.5 size-5 shrink-0" />
                <span>
                  <span className="block font-medium">{t("report.anonymous")}</span>
                  <span className="text-sm opacity-80">{t("report.anonymousHint")}</span>
                </span>
              </span>
              <Switch
                checked={draft.anonymous}
                onCheckedChange={(checked) => patch({ anonymous: checked })}
                className="h-7 w-12"
              />
            </label>
            <p className="mt-3 border-t border-current/15 pt-3 text-xs leading-relaxed opacity-80">
              <strong className="font-semibold">{t("report.whoSeesTitle")}</strong> {t("report.whoSeesBody")}
            </p>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">{t("report.checkLooksRight")}</h2>
          <ReviewRow label={t("report.type")} value={draft.type ? typeLabel(draft.type, locale) : "—"} />
          <ReviewRow
            label={t("report.place")}
            value={selectedSite && selectedLocation ? `${selectedLocation.name} · ${selectedSite.name}` : "—"}
          />
          <ReviewRow label={t("report.risk")} value={draft.category ? categoryLabel(draft.category, locale) : "—"} />
          <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
            <span className="text-sm text-muted-foreground">{t("report.severity")}</span>
            {severity && (
              <span className={cn("rounded-full border px-3 py-1 text-sm font-medium", severityClass[severity])}>
                {severityLabel(severity, locale)}
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
          {severity === "critical" && (
            <p className={cn("rounded-xl border px-4 py-3 text-sm", panelClass.danger)}>
              {t("statutory.criticalCheck")}
            </p>
          )}
          <StatutoryBanner compact />
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

function ChoiceButton({
  active,
  onClick,
  className,
  children,
}: {
  active: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-2xl border px-4 py-4 text-left transition-colors",
        active
          ? "border-amber-500 bg-amber-500/15 ring-2 ring-amber-500/40"
          : "border-border bg-card hover:bg-secondary/60",
        className
      )}
    >
      {children}
    </button>
  );
}

function YesNoQuestion({
  label,
  value,
  onChange,
  yes,
  no,
}: {
  label: string;
  value: boolean | null;
  onChange: (value: boolean) => void;
  yes: string;
  no: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <p className="mb-2 font-medium">{label}</p>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2">
        {[true, false].map((option) => (
          <button
            key={String(option)}
            type="button"
            role="radio"
            aria-checked={value === option}
            onClick={() => onChange(option)}
            className={cn(
              "min-h-14 rounded-xl border text-base font-semibold transition-colors",
              value === option
                ? option
                  ? "border-red-500 bg-red-500 text-white"
                  : "border-emerald-500 bg-emerald-500 text-slate-950"
                : "border-border bg-background hover:bg-secondary/60"
            )}
          >
            {option ? yes : no}
          </button>
        ))}
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

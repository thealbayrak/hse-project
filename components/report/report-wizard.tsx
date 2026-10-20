"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  CheckIcon,
  CloudOffIcon,
  CopyIcon,
  EyeOffIcon,
  MapPinIcon,
  ImagePlusIcon,
  LanguagesIcon,
  Loader2Icon,
  MicIcon,
  QrCodeIcon,
  ShieldCheckIcon,
  SparklesIcon,
  SquareIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { StatutoryBanner } from "@/components/layout/statutory-banner";
import { ChoicePicker } from "@/components/report/choice-picker";
import { LocationPicker, type LatLng } from "@/components/report/location-picker";
import { NearbyPlaces } from "@/components/report/nearby-places";
import { useVoiceCapture } from "@/hooks/use-voice-capture";
import { analyzeReport, languageName } from "@/lib/ai/client";
import type { ReportAnalysis } from "@/lib/ai/provider";
import { DEFAULT_REPORTER_NAME, INCIDENT_TYPES, RISK_CATEGORIES } from "@/lib/constants";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { isImageFile } from "@/lib/media";
import { readLastSite, rememberLastSite, serverLastSite, subscribeLastSite } from "@/lib/report/last-site";
import { deriveSeverity } from "@/lib/report/severity";
import { useIncidentStore } from "@/lib/store/incident-store";
import { categoriesLabel, categoryLabel, severityLabel, typeLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { panelClass, severityClass } from "@/lib/tones";
import { isPositiveType, type IncidentType, type ReportDraft, type SitePerson } from "@/lib/types";

const TYPE_HINT: Record<IncidentType, string> = {
  "near-miss": "incident.nearMissHint",
  hazard: "incident.hazardHint",
  accident: "incident.accidentHint",
  "good-observation": "incident.goodObservationHint",
  "positive-observation": "incident.positiveObservationHint",
  environmental: "incident.environmentalHint",
  other: "incident.otherHint",
};

const STEP_KEYS = ["report.stepWhat", "report.stepDetails", "report.stepReview"] as const;
const STEP_SHORT_KEYS = ["report.stepWhatShort", "report.stepDetailsShort", "report.stepReviewShort"] as const;

interface Draft extends Omit<ReportDraft, "severity"> {
  hurt: boolean | null;
  danger: boolean | null;
  summarySv: string | null;
  originalLanguage: string | null;
  originalText: string | null;
  aiConfidence: number | null;
  position: LatLng | null;
  reporter: SitePerson | null;
}

const EMPTY_DRAFT: Draft = {
  type: null,
  typeNote: "",
  siteId: "",
  placeNote: "",
  locationIds: [],
  areaNotes: [],
  categories: [],
  hurt: null,
  danger: null,
  description: "",
  mediaUrls: [],
  photoFiles: [],
  audioFile: null,
  anonymous: false,
  summarySv: null,
  originalLanguage: null,
  originalText: null,
  aiConfidence: null,
  position: null,
  reporter: null,
};

type AnalysisState =
  | { status: "idle" }
  | { status: "working" }
  | { status: "done"; result: ReportAnalysis }
  | { status: "failed"; error: string };

export function ReportWizard({ aiEnabled = false }: { aiEnabled?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project") ?? searchParams.get("site");
  const orgParam = searchParams.get("org");
  const { locale, t } = useLanguage();
  const { sites, createIncident, loading, error, listSitePeople, listOrgPeople, listRiskTypes, listOrganizations } = useIncidentStore();
  const [showMap, setShowMap] = useState(false);
  const [companyRisks, setCompanyRisks] = useState<{ orgId: string; labels: string[] } | null>(null);
  const [companyName, setCompanyName] = useState<{ orgId: string; name: string } | null>(null);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ reference: string; pending: boolean; trackingCode: string | null } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisState>({ status: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const descriptionAnchor = useRef("");
  const analyzedBlobRef = useRef<Blob | null>(null);
  const quickRef = useRef(false);
  const lastSite = useSyncExternalStore(subscribeLastSite, readLastSite, serverLastSite);

  const voice = useVoiceCapture((text) => {
    const base = descriptionAnchor.current;
    patch({ description: [base, text].filter(Boolean).join(" ") });
  }, locale);

  // The last-used site is listed first but never pre-selected: the worker (or the
  // assistant, from the voice note) names the place every time.
  // A company QR code carries ?org=<company id>: only that company's places are offered.
  // An older site QR code carries ?project=<site id>: the site is fixed.
  const lockedSite = projectId ? sites.find((site) => site.id === projectId) : undefined;
  const lockedOrgId = lockedSite?.organizationId ?? orgParam ?? null;
  const companySites = sites.filter((site) => site.active !== false && (!lockedOrgId || site.organizationId === lockedOrgId));
  const orderedSites = lastSite
    ? [...companySites].sort((a, b) => Number(b.id === lastSite.siteId) - Number(a.id === lastSite.siteId))
    : companySites;
  const onlySite = lockedOrgId && companySites.length === 1 ? companySites[0] : undefined;
  const siteId = draft.siteId || lockedSite?.id || (draft.placeNote ? "" : (onlySite?.id ?? ""));
  const selectedSite = sites.find((site) => site.id === siteId);
  const locations = selectedSite?.locations ?? [];
  const locationIds = draft.locationIds.filter((id) => locations.some((location) => location.id === id));
  const selectedLocations = locations.filter((location) => locationIds.includes(location.id));
  const firstLocation = selectedLocations[0];
  const mapCenter: LatLng | null =
    firstLocation?.latitude != null && firstLocation?.longitude != null
      ? { latitude: firstLocation.latitude, longitude: firstLocation.longitude }
      : selectedSite?.latitude != null && selectedSite?.longitude != null
        ? { latitude: selectedSite.latitude, longitude: selectedSite.longitude }
        : null;

  const organizationId = selectedSite?.organizationId ?? lockedOrgId ?? null;
  const organizationLabel =
    selectedSite?.organizationName ?? companySites[0]?.organizationName ?? (companyName?.orgId === lockedOrgId ? companyName?.name : undefined);

  // The company's own risk types join the built-in list.
  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    listRiskTypes(organizationId)
      .then((rows) => {
        if (!cancelled) setCompanyRisks({ orgId: organizationId, labels: rows.map((row) => row.label) });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [organizationId, listRiskTypes]);
  const ownRisks = companyRisks?.orgId === organizationId ? companyRisks.labels : [];

  // A company without places yet still shows its name on the QR form.
  useEffect(() => {
    if (!lockedOrgId || companySites.length) return;
    let cancelled = false;
    listOrganizations()
      .then((rows) => {
        const found = rows.find((row) => row.id === lockedOrgId);
        if (!cancelled && found) setCompanyName({ orgId: lockedOrgId, name: found.name });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [lockedOrgId, companySites.length, listOrganizations]);

  const effectiveType = draft.type ?? (draft.typeNote ? "other" : null);
  const positive = effectiveType ? isPositiveType(effectiveType) : false;
  // Only the description is required. Unanswered questions get a cautious default the team can correct.
  const severity =
    deriveSeverity(effectiveType ?? "other", draft) ?? (positive ? "low" : effectiveType === "accident" ? "high" : "medium");
  const step1Ready = true;
  const step2Ready = draft.description.trim().length >= 8;
  const builtInRisks = RISK_CATEGORIES.map((item) => item.id as string);
  const riskOptions = [
    ...RISK_CATEGORIES.map((item) => ({ value: item.id as string, label: categoryLabel(item.id, locale) })),
    ...ownRisks.filter((label) => !builtInRisks.includes(label)).map((label) => ({ value: label, label })),
  ];
  const selectedRiskValues = draft.categories.filter((value) => riskOptions.some((option) => option.value === value));
  const customRisks = draft.categories.filter((value) => !riskOptions.some((option) => option.value === value));
  const placeSummary = [
    selectedLocations.map((location) => location.name).join(", "),
    selectedSite?.name ?? "",
    draft.placeNote,
    draft.areaNotes.join(", "),
  ]
    .filter(Boolean)
    .join(" · ");

  // People on the chosen site, so the reporter can pick their own name.
  const [sitePeople, setSitePeople] = useState<{ siteId: string; people: SitePerson[] } | null>(null);
  const [peopleQuery, setPeopleQuery] = useState("");
  const peopleKey = siteId || (organizationId ? `org:${organizationId}` : "");
  useEffect(() => {
    if (!peopleKey) return;
    let cancelled = false;
    const load = siteId ? listSitePeople(siteId) : listOrgPeople(organizationId!);
    load
      .then((people) => {
        if (!cancelled) setSitePeople({ siteId: peopleKey, people });
      })
      .catch(() => {
        if (!cancelled) setSitePeople({ siteId: peopleKey, people: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [peopleKey, siteId, organizationId, listSitePeople, listOrgPeople]);
  const peopleOnSite = sitePeople?.siteId === peopleKey ? sitePeople.people : [];
  const filteredPeople = peopleOnSite.filter((person) => {
    const needle = peopleQuery.trim().toLowerCase();
    return !needle || person.fullName.toLowerCase().includes(needle) || (person.employeeNo ?? "").toLowerCase().includes(needle);
  });

  function patch(next: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  // A finished voice note is sent to the assistant once; the result fills the form.
  // Recorded on step 0 ("just say what happened") it also fills type and place.
  useEffect(() => {
    const blob = voice.audioBlob;
    if (!aiEnabled || !blob || analyzedBlobRef.current === blob) return;
    analyzedBlobRef.current = blob;
    const quick = quickRef.current;
    Promise.resolve().then(() => runAnalysis({ audio: blob, quick }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.audioBlob, aiEnabled]);

  async function runAnalysis(input: { audio?: Blob; text?: string; quick?: boolean }) {
    setAnalysis({ status: "working" });
    try {
      const result = await analyzeReport({ ...input, locale, sites: companySites });
      let next: Draft | null = null;
      setDraft((current) => {
        const site = current.siteId || lockedSite?.id || result.siteId || "";
        const suggestedLocation = result.siteId && site === result.siteId ? result.locationId : null;
        next = {
          ...current,
          type: current.type ?? result.type,
          siteId: site,
          locationIds: current.locationIds.length ? current.locationIds : suggestedLocation ? [suggestedLocation] : [],
          description: result.transcript || current.description,
          categories: current.categories.length ? current.categories : result.category ? [result.category] : [],
          hurt: current.hurt ?? result.hurt,
          danger: current.danger ?? result.danger,
          summarySv: result.summarySv || null,
          originalLanguage: result.originalLanguage || null,
          originalText: result.transcript || current.description || null,
          aiConfidence: result.confidence,
        };
        return next;
      });
      setAnalysis({ status: "done", result });
      if (input.quick && next) {
        // Only the description is required: with it the worker can go straight to check and send.
        const filled = next as Draft;
        if (filled.description.trim().length >= 8) {
          setStep(2);
          toast.success(t("quick.filled"));
        } else {
          setStep(1);
        }
      }
    } catch (caught) {
      setAnalysis({ status: "failed", error: caught instanceof Error ? caught.message : "failed" });
    }
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

  async function toggleVoice(quick = false) {
    if (!voice.supported) {
      toast.error(t("toast.voiceUnavailable"));
      return;
    }
    if (voice.recording) {
      await voice.toggle();
      if (!aiEnabled) toast.success(t("toast.voiceCaptured"));
      return;
    }
    quickRef.current = quick;
    descriptionAnchor.current = draft.description.trim();
    try {
      await voice.toggle();
    } catch {
      toast.error(t("toast.micNeeded"));
    }
  }

  async function submit() {
    if (!step2Ready) return;
    setSubmitting(true);
    try {
      const reporter = draft.anonymous ? null : draft.reporter;
      const locationNote = [draft.placeNote.trim(), ...draft.areaNotes.map((note) => note.trim())].filter(Boolean).join(" · ");
      const created = await createIncident({
        type: effectiveType ?? "other",
        typeNote: draft.typeNote.trim() || null,
        siteId,
        organizationId,
        locationNote: locationNote || null,
        locationId: locationIds[0] ?? "",
        locationIds,
        category: draft.categories[0] ?? "unclassified",
        categories: draft.categories,
        severity,
        description: draft.description.trim(),
        mediaUrls: draft.mediaUrls,
        photoFiles: draft.photoFiles,
        audioFile: voice.audioBlob ?? draft.audioFile,
        anonymous: draft.anonymous,
        reporterName: draft.anonymous ? null : (reporter?.fullName ?? DEFAULT_REPORTER_NAME),
        reporterProfileId: reporter?.id ?? null,
        latitude: draft.position?.latitude ?? null,
        longitude: draft.position?.longitude ?? null,
        originalLanguage: draft.originalLanguage,
        originalText: draft.originalText,
        summarySv: draft.summarySv,
        aiConfidence: draft.aiConfidence,
      });
      if (siteId) rememberLastSite({ siteId, locationId: locationIds[0] ?? "" });
      setSubmitted({
        reference: created.reference,
        pending: Boolean(created.pending),
        trackingCode: created.trackingCode ?? null,
      });
      toast.success(created.pending ? t("offline.queued") : t("toast.reportReceived"));
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : t("toast.reportFailed");
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setDraft(EMPTY_DRAFT);
    setSubmitted(null);
    setAnalysis({ status: "idle" });
    analyzedBlobRef.current = null;
    setPeopleQuery("");
    setShowMap(false);
    setStep(0);
    voice.clearAudio();
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
        </div>

        {submitted.trackingCode && <TrackingCodeCard code={submitted.trackingCode} />}

        <div className="grid gap-3 sm:grid-cols-2">
          <Button className="h-14 text-base" variant="outline" onClick={reset}>
            {t("buttons.reportAnother")}
          </Button>
          <Button className="h-14 text-base" onClick={() => router.push("/")}>
            {t("buttons.done")}
          </Button>
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
          {aiEnabled && (
            <div className={cn("rounded-2xl border p-4", panelClass.info)}>
              <div className="flex items-start gap-3">
                <LanguagesIcon className="mt-0.5 size-5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-semibold">{t("quick.title")}</h2>
                  <p className="text-sm opacity-80">{t("quick.hint")}</p>
                </div>
              </div>
              <Button
                type="button"
                variant={voice.recording ? "destructive" : "default"}
                className="mt-4 h-16 w-full gap-3 text-base"
                onClick={() => void toggleVoice(true)}
                disabled={analysis.status === "working"}
              >
                {analysis.status === "working" ? (
                  <Loader2Icon className="size-5 animate-spin" />
                ) : voice.recording ? (
                  <SquareIcon className="size-5" />
                ) : (
                  <MicIcon className="size-5" />
                )}
                {analysis.status === "working" ? t("ai.analyzing") : voice.recording ? t("quick.stop") : t("quick.record")}
              </Button>
              {analysis.status === "failed" && (
                <p className={cn("mt-3 rounded-lg border px-3 py-2 text-sm", panelClass.warning)}>{t("ai.unavailable")}</p>
              )}
            </div>
          )}

          {(lockedSite || lockedOrgId) && (
            <div className="flex items-center gap-3 rounded-2xl border border-amber-500 bg-amber-500/15 px-4 py-3">
              <QrCodeIcon className="size-5 shrink-0" />
              <span className="min-w-0">
                <span className="block font-medium">{lockedSite?.name ?? organizationLabel ?? "—"}</span>
                <span className="block text-xs text-muted-foreground">
                  {[lockedSite ? lockedSite.organizationName : null, lockedSite?.city].filter(Boolean).join(" · ")}
                  {lockedSite ? " · " : ""}
                  {t("report.projectLocked")}
                </span>
              </span>
            </div>
          )}

          <fieldset>
            <legend className="mb-1 text-lg font-semibold">{t("incident.whatToReport")}</legend>
            <p className="mb-3 text-sm text-muted-foreground">{t("picker.optional")}</p>
            <ChoicePicker
              placeholder={t("picker.typePlaceholder")}
              options={INCIDENT_TYPES.map((item) => ({ value: item.id, label: typeLabel(item.id, locale), hint: t(TYPE_HINT[item.id]) }))}
              selected={draft.type && draft.type !== "other" ? [draft.type] : []}
              custom={draft.typeNote ? [draft.typeNote] : []}
              onChange={(selected, custom) =>
                patch({
                  type: (selected[0] as typeof draft.type) ?? (custom[0] ? "other" : null),
                  typeNote: selected[0] ? "" : (custom[0] ?? ""),
                })
              }
              addLabel={t("picker.add")}
              addPlaceholder={t("picker.typeAdd")}
              doneLabel={t("picker.done")}
            />
          </fieldset>

          {!lockedSite && (
            <fieldset>
              <legend className="mb-1 text-lg font-semibold">{t("incident.where")}</legend>
              <p className="mb-3 text-sm text-muted-foreground">{t("picker.optional")}</p>
              {loading && !sites.length && <p className="mb-3 text-sm text-muted-foreground">{t("report.loadingSites")}</p>}
              <ChoicePicker
                placeholder={t("picker.placePlaceholder")}
                options={orderedSites.map((site) => ({
                  value: site.id,
                  label: site.name,
                  hint: [lockedOrgId ? null : site.organizationName, site.city, lastSite?.siteId === site.id ? t("report.lastUsed") : null]
                    .filter(Boolean)
                    .join(" · "),
                }))}
                selected={siteId ? [siteId] : []}
                custom={draft.placeNote ? [draft.placeNote] : []}
                onChange={(selected, custom) =>
                  patch({ siteId: selected[0] ?? "", placeNote: selected[0] ? "" : (custom[0] ?? ""), locationIds: [], position: null })
                }
                addLabel={t("picker.add")}
                addPlaceholder={t("picker.placeAdd")}
                doneLabel={t("picker.done")}
                searchPlaceholder={t("picker.search")}
              />
            </fieldset>
          )}

          <fieldset>
            <legend className="mb-1 text-lg font-semibold">{t("incident.whichArea")}</legend>
            <p className="mb-3 text-sm text-muted-foreground">{t("incident.whichAreaHint")}</p>
            <ChoicePicker
              multiple
              placeholder={locations.length ? t("picker.areaPlaceholder") : t("picker.areaDescribe")}
              options={locations.map((location) => ({ value: location.id, label: location.name }))}
              selected={locationIds}
              custom={draft.areaNotes}
              onChange={(selected, custom) => patch({ locationIds: selected, areaNotes: custom })}
              addLabel={t("picker.add")}
              addPlaceholder={t("picker.areaAdd")}
              doneLabel={t("picker.done")}
              searchPlaceholder={t("picker.search")}
            />
          </fieldset>

          <fieldset>
            {showMap || draft.position ? (
              <>
                <legend className="mb-1 text-lg font-semibold">{t("map.title")}</legend>
                <p className="mb-3 text-sm text-muted-foreground">{t("map.optionalHint")}</p>
                <LocationPicker
                  key={`${siteId}:${firstLocation?.id ?? ""}`}
                  center={mapCenter}
                  value={draft.position}
                  onChange={(position) => patch({ position })}
                />
              </>
            ) : (
              <Button type="button" variant="outline" className="h-12 w-full gap-2" onClick={() => setShowMap(true)}>
                <MapPinIcon className="size-4" />
                {t("map.openOptional")}
              </Button>
            )}
          </fieldset>
        </section>
      )}

      {step === 1 && (
        <section className="space-y-6">
          {/* Voice first: any language in, Swedish summary out. */}
          <div className={cn("rounded-2xl border p-4", aiEnabled ? panelClass.info : "border-border bg-card")}>
            <div className="flex items-start gap-3">
              <LanguagesIcon className="mt-0.5 size-5 shrink-0" />
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold">{aiEnabled ? t("ai.title") : t("report.whatHappened")}</h2>
                <p className="text-sm opacity-80">{aiEnabled ? t("ai.hint") : t("report.placeholder")}</p>
              </div>
            </div>
            <Button
              type="button"
              variant={voice.recording ? "destructive" : "default"}
              className="mt-4 h-16 w-full gap-3 text-base"
              onClick={() => void toggleVoice()}
              disabled={analysis.status === "working"}
            >
              {voice.recording ? <SquareIcon className="size-5" /> : <MicIcon className="size-5" />}
              {voice.recording ? (aiEnabled ? t("ai.stop") : t("buttons.listening")) : aiEnabled ? t("ai.record") : t("buttons.recordVoice")}
            </Button>
            {analysis.status === "working" && (
              <p className="mt-3 flex items-center gap-2 text-sm">
                <Loader2Icon className="size-4 animate-spin" />
                {t("ai.analyzing")}
              </p>
            )}
            {analysis.status === "done" && (
              <div className="mt-3 space-y-1 text-sm">
                <p className="flex items-center gap-2 font-medium">
                  <SparklesIcon className="size-4" />
                  {t("ai.applied")}
                </p>
                {analysis.result.originalLanguage && (
                  <p className="text-xs opacity-80">
                    {t("ai.detected", { lang: languageName(analysis.result.originalLanguage, locale) })}
                  </p>
                )}
                {analysis.result.confidence < 0.5 && (
                  <p className={cn("rounded-lg border px-3 py-2 text-xs", panelClass.warning)}>{t("ai.lowConfidence")}</p>
                )}
              </div>
            )}
            {analysis.status === "failed" && (
              <p className={cn("mt-3 rounded-lg border px-3 py-2 text-sm", panelClass.warning)}>{t("ai.unavailable")}</p>
            )}
            {voice.recording && !aiEnabled && (
              <p className="mt-2 text-xs text-muted-foreground">{t("report.recordingNote")}</p>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{t("report.whatHappened")}</h2>
              {aiEnabled && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 gap-2"
                  disabled={analysis.status === "working" || draft.description.trim().length < 8}
                  onClick={() => void runAnalysis({ text: draft.description })}
                >
                  <SparklesIcon className="size-4" />
                  {t("ai.fromText")}
                </Button>
              )}
            </div>
            <Textarea
              value={draft.description}
              onChange={(event) => patch({ description: event.target.value, summarySv: null, originalText: null })}
              placeholder={t("report.placeholder")}
              className="min-h-32 text-base"
            />
            {draft.summarySv && (
              <div className="mt-2 rounded-xl border border-border bg-secondary/40 px-3 py-2">
                <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{t("ai.summaryTitle")}</p>
                <p className="mt-1 text-sm">{draft.summarySv}</p>
              </div>
            )}
            {aiEnabled && <p className="mt-2 text-xs text-muted-foreground">{t("ai.poweredBy")}</p>}
          </div>

          {!positive && (
          <fieldset>
            <legend className="mb-1 text-lg font-semibold">{t("incident.howSerious")}</legend>
            <p className="mb-3 text-sm text-muted-foreground">{t("report.answerOptional")}</p>
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
          )}

          {draft.hurt === true && draft.position && (
            <NearbyPlaces latitude={draft.position.latitude} longitude={draft.position.longitude} />
          )}

          <fieldset>
            <legend className="mb-1 text-lg font-semibold">{t("incident.whatRisk")}</legend>
            <p className="mb-3 text-sm text-muted-foreground">{t("incident.whatRiskHint")}</p>
            <ChoicePicker
              multiple
              placeholder={t("picker.riskPlaceholder")}
              options={riskOptions}
              selected={selectedRiskValues}
              custom={customRisks}
              onChange={(selected, custom) => patch({ categories: [...selected, ...custom] })}
              addLabel={t("picker.add")}
              addPlaceholder={t("picker.riskAdd")}
              doneLabel={t("picker.done")}
              searchPlaceholder={t("picker.search")}
            />
          </fieldset>

          <div>
            <h2 className="text-lg font-semibold">{t("report.addPhoto")}</h2>
            <p className="mb-3 text-sm text-muted-foreground">{t("report.addPhotoHint")}</p>
            <p className={cn("mb-3 rounded-lg border px-3 py-2 text-sm", panelClass.info)}>{t("report.photoRecommended")}</p>
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

          {!draft.anonymous && peopleOnSite.length > 0 && (
            <fieldset>
              <legend className="mb-1 text-lg font-semibold">{t("reporter.title")}</legend>
              <p className="mb-3 text-sm text-muted-foreground">{t("reporter.hint")}</p>
              {draft.reporter ? (
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-500 bg-amber-500/15 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block font-medium">{t("reporter.selected", { name: draft.reporter.fullName })}</span>
                    <span className="block text-xs text-muted-foreground">
                      {t(`roleNames.${draft.reporter.role}`)}
                      {draft.reporter.employeeNo ? ` · ${draft.reporter.employeeNo}` : ""}
                    </span>
                  </span>
                  <Button type="button" variant="outline" size="sm" className="h-10" onClick={() => patch({ reporter: null })}>
                    {t("reporter.change")}
                  </Button>
                </div>
              ) : (
                <>
                  <input
                    type="search"
                    value={peopleQuery}
                    onChange={(event) => setPeopleQuery(event.target.value)}
                    placeholder={t("reporter.search")}
                    className="mb-2 h-12 w-full rounded-xl border border-border bg-background px-4 text-base"
                  />
                  <div className="grid max-h-64 gap-2 overflow-y-auto">
                    {filteredPeople.slice(0, 30).map((person) => (
                      <ChoiceButton key={person.id} active={false} onClick={() => patch({ reporter: person })} className="min-h-12 px-4 py-2.5">
                        <span className="block text-sm font-medium">{person.fullName}</span>
                        <span className="block text-xs text-muted-foreground">
                          {t(`roleNames.${person.role}`)}
                          {person.employeeNo ? ` · ${person.employeeNo}` : ""}
                        </span>
                      </ChoiceButton>
                    ))}
                    {filteredPeople.length === 0 && <p className="text-sm text-muted-foreground">{t("reporter.none")}</p>}
                  </div>
                </>
              )}
            </fieldset>
          )}
        </section>
      )}

      {step === 2 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">{t("report.checkLooksRight")}</h2>
          <ReviewRow label={t("report.type")} value={effectiveType ? typeLabel(effectiveType, locale, draft.typeNote) : t("report.notGiven")} />
          <ReviewRow label={t("report.company")} value={organizationLabel ?? t("report.notGiven")} />
          <ReviewRow label={t("report.place")} value={placeSummary || t("report.notGiven")} />
          <ReviewRow label={t("report.risk")} value={categoriesLabel(draft.categories, locale)} />
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
            value={draft.anonymous ? t("report.anonymousPerson") : (draft.reporter?.fullName ?? t("report.siteWorker"))}
          />
          {draft.position && (
            <ReviewRow label={t("map.title")} value={`${draft.position.latitude.toFixed(5)}, ${draft.position.longitude.toFixed(5)}`} />
          )}
          <div className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-sm text-muted-foreground">{t("report.description")}</p>
            <p className="mt-1 text-sm leading-relaxed whitespace-pre-line">{draft.description}</p>
            {draft.summarySv && (
              <>
                <p className="mt-3 text-sm text-muted-foreground">{t("ai.summaryTitle")}</p>
                <p className="mt-1 text-sm leading-relaxed">{draft.summarySv}</p>
              </>
            )}
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
            disabled={(step === 0 && !step1Ready) || (step === 1 && (!step2Ready || analysis.status === "working"))}
            title={step === 1 && !step2Ready ? t("report.describeFirst") : undefined}
            onClick={() => setStep((current) => current + 1)}
          >
            {t("buttons.continue")}
          </Button>
        ) : (
          <Button
            type="button"
            className="h-14 text-base"
            disabled={submitting || !step2Ready}
            onClick={() => void submit()}
          >
            {submitting
              ? t("buttons.sending")
              : effectiveType === "hazard"
                ? t("buttons.submitHazard")
                : t("buttons.sendReport")}
          </Button>
        )}
      </div>
    </div>
  );
}

function TrackingCodeCard({ code }: { code: string }) {
  const { t } = useLanguage();

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(t("track.copied"));
    } catch {
      // Clipboard can be blocked; the code is still on screen.
    }
  }

  return (
    <div className={cn("rounded-2xl border p-5 text-center", panelClass.info)}>
      <p className="text-xs font-semibold tracking-wide uppercase opacity-80">{t("track.yourCode")}</p>
      <p className="mt-2 font-mono text-3xl font-semibold tracking-[0.2em]">{code}</p>
      <p className="mt-2 text-sm opacity-85">{t("track.saveCode")}</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Button type="button" variant="outline" className="h-12 gap-2" onClick={() => void copy()}>
          <CopyIcon className="size-4" />
          {t("track.copy")}
        </Button>
        <Link
          href={`/track?code=${encodeURIComponent(code)}`}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 text-sm font-medium text-slate-950"
        >
          <ShieldCheckIcon className="size-4" />
          {t("track.follow")}
        </Link>
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

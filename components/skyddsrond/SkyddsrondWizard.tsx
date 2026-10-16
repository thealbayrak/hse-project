"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CameraIcon,
  CheckIcon,
  CircleSlashIcon,
  ClipboardCheckIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { StatutoryBanner } from "@/components/layout/statutory-banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SAFETY_OFFICERS } from "@/lib/constants";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { SKYDDSROND_DOMAINS, skyddsrondTitle } from "@/lib/skyddsrond/checklist";
import { useIncidentStore } from "@/lib/store/incident-store";
import { cn } from "@/lib/utils";
import { isImageFile } from "@/lib/media";
import { panelClass } from "@/lib/tones";
import type { CreateSafetyWalkItemInput, SafetyWalkDomainId, SafetyWalkItemStatus, Site } from "@/lib/types";

type ItemDraft = {
  status: SafetyWalkItemStatus | null;
  notes: string;
  photoFile: File | null;
  photoPreview: string | null;
};

function emptyItems(): Record<string, ItemDraft> {
  return Object.fromEntries(
    SKYDDSROND_DOMAINS.flatMap((domain) =>
      domain.items.map((item) => [
        item.key,
        { status: null, notes: "", photoFile: null, photoPreview: null },
      ])
    )
  );
}

function domainKeys(id: SafetyWalkDomainId) {
  if (id === "fall-protection") return { local: "walk.domainFall", sv: "walk.domainFallSv" };
  if (id === "order-cleanliness") return { local: "walk.domainOrder", sv: "walk.domainOrderSv" };
  if (id === "scaffolding-ladders") return { local: "walk.domainScaffold", sv: "walk.domainScaffoldSv" };
  if (id === "ppe") return { local: "walk.domainPpe", sv: "walk.domainPpeSv" };
  return { local: "walk.domainFire", sv: "walk.domainFireSv" };
}

// Step 0 = walk details, steps 1..N = one checklist section each, last = review.
const SETUP_STEP = 0;
const REVIEW_STEP = SKYDDSROND_DOMAINS.length + 1;
const TOTAL_STEPS = REVIEW_STEP + 1;

export function SkyddsrondWizard({
  onCompleted,
  onCancel,
  showFullPageLink = false,
}: {
  onCompleted?: () => void;
  onCancel?: () => void;
  showFullPageLink?: boolean;
}) {
  const { locale, t } = useLanguage();
  const { sites, createSafetyWalk } = useIncidentStore();
  const router = useRouter();
  const [step, setStep] = useState(SETUP_STEP);
  const [chosenSiteId, setSiteId] = useState("");
  const [title, setTitle] = useState("");
  const [skyddsombudName, setSkyddsombudName] = useState("");
  const [skyddsombudRole, setSkyddsombudRole] = useState("Skyddsombud");
  const [items, setItems] = useState<Record<string, ItemDraft>>(emptyItems);
  const [submitting, setSubmitting] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  // Default to the first site until the user picks one.
  const siteId = chosenSiteId || sites[0]?.id || "";
  const selectedSite = sites.find((site) => site.id === siteId) ?? null;
  const assessed = Object.values(items).filter((item) => item.status).length;
  const total = SKYDDSROND_DOMAINS.reduce((sum, domain) => sum + domain.items.length, 0);
  const deviations = Object.values(items).filter((item) => item.status === "deviation").length;

  const generatedTitle = useMemo(
    () => skyddsrondTitle(selectedSite?.name || "Site"),
    [selectedSite?.name]
  );
  const walkTitle = title.trim() || generatedTitle;

  const missingNotes = SKYDDSROND_DOMAINS.flatMap((domain) => domain.items).filter((item) => {
    const draft = items[item.key];
    return draft.status === "deviation" && draft.notes.trim().length < 8;
  });

  function patchItem(key: string, next: Partial<ItemDraft>) {
    setItems((current) => ({ ...current, [key]: { ...current[key], ...next } }));
  }

  function goTo(next: number) {
    if (next === SETUP_STEP + 1 && !skyddsombudName.trim()) {
      toast.error(t("toast.walkNeedRep"));
      return;
    }
    setStep(Math.min(Math.max(next, SETUP_STEP), REVIEW_STEP));
    topRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  async function submit() {
    if (!siteId) {
      toast.error(t("toast.walkNeedSite"));
      return;
    }
    if (!skyddsombudName.trim()) {
      toast.error(t("toast.walkNeedRep"));
      return;
    }
    if (assessed < total) {
      toast.error(t("toast.walkNeedAll"));
      return;
    }
    if (missingNotes.length) {
      toast.error(t("toast.walkNeedNotes"));
      return;
    }

    const payload: CreateSafetyWalkItemInput[] = SKYDDSROND_DOMAINS.flatMap((domain, domainIndex) =>
      domain.items.map((item, itemIndex) => {
        const draft = items[item.key];
        return {
          itemKey: item.key,
          domain: domain.id,
          title: item.title,
          status: draft.status as SafetyWalkItemStatus,
          notes: draft.notes.trim(),
          photoFile: draft.photoFile,
          sortOrder: domainIndex * 10 + itemIndex,
        };
      })
    );

    setSubmitting(true);
    try {
      const created = await createSafetyWalk({
        title: walkTitle,
        siteId,
        skyddsombudName: skyddsombudName.trim(),
        skyddsombudRole: skyddsombudRole.trim() || "Skyddsombud",
        items: payload,
      });
      const open = created.items.filter((item) => item.status === "deviation").length;
      toast.success(open ? t("toast.walkSavedActions", { count: open }) : t("toast.walkSaved"));
      if (onCompleted) onCompleted();
      else router.push("/dashboard");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : t("toast.walkFailed");
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  const domain = step >= 1 && step <= SKYDDSROND_DOMAINS.length ? SKYDDSROND_DOMAINS[step - 1] : null;
  const stepLabel =
    step === SETUP_STEP
      ? t("walk.setup")
      : step === REVIEW_STEP
        ? t("walk.summary")
        : locale === "sv"
          ? t(domainKeys(domain!.id).sv)
          : t(domainKeys(domain!.id).local);

  return (
    <div ref={topRef} className="space-y-5 scroll-mt-24">
      {/* Progress */}
      <div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{t("walk.sectionOf", { n: step + 1, total: TOTAL_STEPS })}</span>
          <span>
            {t("walk.assessed", { done: assessed, total })}
            {deviations ? ` · ${t("walk.deviationCount", { count: deviations })}` : ""}
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuemin={0} aria-valuemax={TOTAL_STEPS} aria-valuenow={step + 1}>
          <div className="h-full rounded-full bg-amber-500 transition-[width]" style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }} />
        </div>
        <h3 className="mt-3 text-lg font-semibold tracking-tight">{stepLabel}</h3>
        {domain && locale !== "sv" && (
          <p className="text-sm text-muted-foreground">{t(domainKeys(domain.id).sv)}</p>
        )}
      </div>

      {step === SETUP_STEP && (
        <div className="space-y-5">
          <StatutoryBanner notice="sam" compact />

          {showFullPageLink && (
            <p className="text-xs text-muted-foreground">
              {t("walk.fullPage")}{" "}
              <Link href="/skyddsrond" className="font-medium text-amber-700 underline-offset-4 hover:underline dark:text-amber-300">
                {t("walk.openFull")}
              </Link>
            </p>
          )}

          <SitePicker sites={sites} siteId={siteId} onChange={setSiteId} label={t("walk.site")} />

          <div className="space-y-2">
            <Label htmlFor="walk-title">{t("walk.walkTitle")}</Label>
            <Input
              id="walk-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={generatedTitle}
              className="h-12"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="skyddsombud">{t("walk.skyddsombud")}</Label>
              <Input
                id="skyddsombud"
                value={skyddsombudName}
                onChange={(event) => setSkyddsombudName(event.target.value)}
                placeholder={t("walk.name")}
                className="h-12"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="skyddsombud-role">{t("walk.role")}</Label>
              <Input
                id="skyddsombud-role"
                value={skyddsombudRole}
                onChange={(event) => setSkyddsombudRole(event.target.value)}
                placeholder="Skyddsombud"
                className="h-12"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {SAFETY_OFFICERS.map((officer) => (
              <button
                key={officer.id}
                type="button"
                onClick={() => {
                  setSkyddsombudName(officer.name);
                  setSkyddsombudRole(t(`officerRoles.${officer.roleKey}`));
                }}
                className={cn(
                  "min-h-11 rounded-full border px-3 text-sm",
                  skyddsombudName === officer.name
                    ? "border-amber-500 bg-amber-500 text-slate-950"
                    : "border-border bg-card text-muted-foreground hover:bg-secondary/70"
                )}
              >
                {officer.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {domain && (
        <div className="space-y-3">
          {domain.items.map((item) => (
            <ChecklistRow
              key={item.key}
              itemKey={item.key}
              title={t(`walk.${item.key}`)}
              prompt={t(`walk.${item.key}Prompt`)}
              draft={items[item.key]}
              onStatus={(status) => patchItem(item.key, { status })}
              onNotes={(notes) => patchItem(item.key, { notes })}
              onPhoto={(photoFile, photoPreview) => patchItem(item.key, { photoFile, photoPreview })}
            />
          ))}
        </div>
      )}

      {step === REVIEW_STEP && (
        <div className="space-y-4">
          <div className={cn("rounded-2xl border p-4", assessed < total || missingNotes.length ? panelClass.warning : panelClass.success)}>
            <p className="font-medium">
              {assessed < total ? t("walk.missing", { n: total - assessed }) : t("walk.allAssessed")}
            </p>
            {missingNotes.length > 0 && (
              <p className="mt-1 text-sm opacity-80">{t("toast.walkNeedNotes")}</p>
            )}
            <p className="mt-1 text-sm opacity-80">
              {walkTitle} · {skyddsombudName || "—"}
              {skyddsombudRole ? ` · ${skyddsombudRole}` : ""}
            </p>
          </div>

          <div className="space-y-2">
            {SKYDDSROND_DOMAINS.map((section, index) => {
              const sectionItems = section.items.map((item) => ({ item, draft: items[item.key] }));
              const done = sectionItems.filter(({ draft }) => draft.status).length;
              const dev = sectionItems.filter(({ draft }) => draft.status === "deviation");
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => goTo(index + 1)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left hover:bg-secondary/60"
                >
                  <span>
                    <span className="block text-sm font-medium">
                      {locale === "sv" ? t(domainKeys(section.id).sv) : t(domainKeys(section.id).local)}
                    </span>
                    {dev.length > 0 && (
                      <span className="mt-1 block text-xs text-red-700 dark:text-red-300">
                        {dev.map(({ item }) => t(`walk.${item.key}`)).join(" · ")}
                      </span>
                    )}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium",
                      done === section.items.length ? panelClass.success : panelClass.warning
                    )}
                  >
                    {done}/{section.items.length}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <div className="flex gap-2">
          {onCancel && step === SETUP_STEP && (
            <Button type="button" variant="outline" className="h-12" onClick={onCancel}>
              {t("buttons.cancel")}
            </Button>
          )}
          {step > SETUP_STEP && (
            <Button type="button" variant="outline" className="h-12" onClick={() => goTo(step - 1)}>
              {t("buttons.back")}
            </Button>
          )}
        </div>
        {step < REVIEW_STEP ? (
          <Button className="h-12 min-w-44" onClick={() => goTo(step + 1)}>
            {t("buttons.next")}
          </Button>
        ) : (
          <Button className="h-12 min-w-44" disabled={submitting} onClick={() => void submit()}>
            <ClipboardCheckIcon className="size-4" />
            {submitting ? t("buttons.saving") : t("buttons.submitWalk")}
          </Button>
        )}
      </div>
    </div>
  );
}

function SitePicker({
  sites,
  siteId,
  onChange,
  label,
}: {
  sites: Site[];
  siteId: string;
  onChange: (siteId: string) => void;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="grid gap-2 sm:grid-cols-2">
        {sites.map((site) => (
          <button
            key={site.id}
            type="button"
            onClick={() => onChange(site.id)}
            aria-pressed={siteId === site.id}
            className={cn(
              "min-h-14 rounded-xl border px-3 py-2 text-left",
              siteId === site.id
                ? "border-amber-500 bg-amber-500/15"
                : "border-border bg-background hover:bg-secondary/60"
            )}
          >
            <span className="block text-sm font-medium">{site.name}</span>
            <span className="text-xs text-muted-foreground">{site.city}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ChecklistRow({
  itemKey,
  title,
  prompt,
  draft,
  onStatus,
  onNotes,
  onPhoto,
}: {
  itemKey: string;
  title: string;
  prompt: string;
  draft: ItemDraft;
  onStatus: (status: SafetyWalkItemStatus) => void;
  onNotes: (notes: string) => void;
  onPhoto: (file: File | null, preview: string | null) => void;
}) {
  const { locale, t } = useLanguage();
  const fileRef = useRef<HTMLInputElement>(null);

  function attach(file: File | null) {
    if (draft.photoPreview) URL.revokeObjectURL(draft.photoPreview);
    if (!file || !isImageFile(file)) {
      onPhoto(null, null);
      return;
    }
    onPhoto(file, URL.createObjectURL(file));
  }

  const options: { status: SafetyWalkItemStatus; icon: React.ComponentType<{ className?: string }>; label: string; sv: string }[] = [
    { status: "ok", icon: CheckIcon, label: t("walk.ok"), sv: t("walk.godkand") },
    { status: "deviation", icon: TriangleAlertIcon, label: t("walk.deviation"), sv: t("walk.avvikelse") },
    { status: "na", icon: CircleSlashIcon, label: t("walk.na"), sv: t("walk.ejRelevant") },
  ];

  return (
    <div className="rounded-xl border border-border/80 bg-card p-3">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{prompt}</p>
      <div role="radiogroup" aria-label={title} className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-secondary p-1">
        {options.map((option) => {
          const active = draft.status === option.status;
          return (
            <button
              key={option.status}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onStatus(option.status)}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center rounded-lg px-1 text-xs font-semibold leading-tight transition-colors",
                active
                  ? option.status === "ok"
                    ? "bg-emerald-500 text-slate-950 shadow-sm"
                    : option.status === "deviation"
                      ? "bg-red-500 text-white shadow-sm"
                      : "bg-slate-400 text-slate-950 shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span className="flex items-center gap-1">
                <option.icon className="size-3.5" />
                {option.label}
              </span>
              {locale !== "sv" && (
                <span className="text-[10px] font-normal opacity-80">{option.sv}</span>
              )}
            </button>
          );
        })}
      </div>

      {draft.status === "deviation" && (
        <div className="mt-3 space-y-2">
          <Label htmlFor={`notes-${itemKey}`}>{t("walk.notes")}</Label>
          <Textarea
            id={`notes-${itemKey}`}
            value={draft.notes}
            onChange={(event) => onNotes(event.target.value)}
            placeholder={t("walk.notesHint")}
            className="min-h-24"
          />
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.heic,.heif"
              capture="environment"
              className="sr-only"
              onChange={(event) => attach(event.target.files?.[0] ?? null)}
            />
            <Button type="button" variant="outline" className="h-12" onClick={() => fileRef.current?.click()}>
              <CameraIcon className="size-4" />
              {t("buttons.attachPhoto")}
            </Button>
            {draft.photoPreview && (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={draft.photoPreview} alt="Deviation evidence" className="h-12 w-16 rounded-lg object-cover" />
                <button
                  type="button"
                  className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-red-600 text-white"
                  onClick={() => {
                    if (fileRef.current) fileRef.current.value = "";
                    attach(null);
                  }}
                >
                  <XIcon className="size-3" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

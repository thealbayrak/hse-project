"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  if (id === "fall-protection") return { en: "walk.domainFall", sv: "walk.domainFallSv" };
  if (id === "order-cleanliness") return { en: "walk.domainOrder", sv: "walk.domainOrderSv" };
  if (id === "scaffolding-ladders") return { en: "walk.domainScaffold", sv: "walk.domainScaffoldSv" };
  if (id === "ppe") return { en: "walk.domainPpe", sv: "walk.domainPpeSv" };
  return { en: "walk.domainFire", sv: "walk.domainFireSv" };
}

export function SkyddsrondWizard({
  onCompleted,
  onCancel,
  showFullPageLink = false,
}: {
  onCompleted?: () => void;
  onCancel?: () => void;
  showFullPageLink?: boolean;
}) {
  const { t } = useLanguage();
  const { sites, createSafetyWalk } = useIncidentStore();
  const router = useRouter();
  const [siteId, setSiteId] = useState("");
  const [title, setTitle] = useState("");
  const [skyddsombudName, setSkyddsombudName] = useState("");
  const [skyddsombudRole, setSkyddsombudRole] = useState("Skyddsombud");
  const [items, setItems] = useState<Record<string, ItemDraft>>(emptyItems);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!siteId && sites[0]) setSiteId(sites[0].id);
  }, [siteId, sites]);

  const selectedSite = sites.find((site) => site.id === siteId) ?? null;
  const assessed = Object.values(items).filter((item) => item.status).length;
  const total = SKYDDSROND_DOMAINS.reduce((sum, domain) => sum + domain.items.length, 0);
  const deviations = Object.values(items).filter((item) => item.status === "deviation").length;

  const generatedTitle = useMemo(
    () => skyddsrondTitle(selectedSite?.name || "Site"),
    [selectedSite?.name]
  );
  const walkTitle = title.trim() || generatedTitle;

  function patchItem(key: string, next: Partial<ItemDraft>) {
    setItems((current) => ({ ...current, [key]: { ...current[key], ...next } }));
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
    const missingNotes = SKYDDSROND_DOMAINS.flatMap((domain) => domain.items).find((item) => {
      const draft = items[item.key];
      return draft.status === "deviation" && draft.notes.trim().length < 8;
    });
    if (missingNotes) {
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
      toast.success(
        open ? t("toast.walkSavedActions", { count: open }) : t("toast.walkSaved")
      );
      if (onCompleted) onCompleted();
      else router.push("/dashboard");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : t("toast.walkFailed");
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <StatutoryBanner notice="sam" />

      {showFullPageLink && (
        <p className="text-xs text-muted-foreground">
          {t("walk.fullPage")}{" "}
          <Link href="/skyddsrond" className="font-medium text-amber-300 underline-offset-4 hover:underline">
            {t("walk.openFull")}
          </Link>
        </p>
      )}

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

      <SitePicker sites={sites} siteId={siteId} onChange={setSiteId} label={t("walk.site")} />

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
              setSkyddsombudRole(officer.role);
            }}
            className={cn(
              "min-h-11 rounded-full border px-3 text-sm",
              skyddsombudName === officer.name
                ? "border-amber-400 bg-amber-500 text-slate-950"
                : "border-border bg-card text-muted-foreground hover:bg-secondary/70"
            )}
          >
            {officer.name}
          </button>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">
        {t("walk.assessed", { done: assessed, total })}
        {deviations ? ` · ${t("walk.deviationCount", { count: deviations })}` : ""}
      </p>

      <div className="space-y-4">
        {SKYDDSROND_DOMAINS.map((domain) => (
          <section key={domain.id} className="rounded-2xl border border-border bg-card/70 p-4">
            <h3 className="text-sm font-semibold tracking-wide text-amber-300 uppercase">
              {t(domainKeys(domain.id).sv)}
              <span className="ml-2 font-medium tracking-normal text-muted-foreground normal-case">
                {t(domainKeys(domain.id).en)}
              </span>
            </h3>
            <div className="mt-3 space-y-3">
              {domain.items.map((item) => (
                <ChecklistRow
                  key={item.key}
                  itemKey={item.key}
                  title={t(`walk.${item.key}`)}
                  prompt={t(`walk.${item.key}Prompt`)}
                  draft={items[item.key]}
                  onStatus={(status) => patchItem(item.key, { status })}
                  onNotes={(notes) => patchItem(item.key, { notes })}
                  onPhoto={(photoFile, photoPreview) =>
                    patchItem(item.key, { photoFile, photoPreview })
                  }
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button type="button" variant="outline" className="h-12" onClick={onCancel}>
            {t("buttons.cancel")}
          </Button>
        )}
        <Button className="h-12 min-w-44" disabled={submitting} onClick={() => void submit()}>
          <ClipboardCheckIcon className="size-4" />
          {submitting ? t("buttons.saving") : t("buttons.submitWalk")}
        </Button>
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
            className={cn(
              "min-h-14 rounded-xl border px-3 py-2 text-left",
              siteId === site.id
                ? "border-amber-400 bg-amber-500/15"
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
    if (!file) {
      onPhoto(null, null);
      return;
    }
    onPhoto(file, URL.createObjectURL(file));
  }

  return (
    <div className="rounded-xl border border-border/80 bg-background/60 p-3">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{prompt}</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <StatusButton
          active={draft.status === "ok"}
          tone="ok"
          onClick={() => onStatus("ok")}
        >
          <CheckIcon className="size-4" />
          {locale === "sv" ? t("walk.godkand") : t("walk.ok")}
          <span className="block text-[10px] font-normal opacity-80">
            {locale === "sv" ? t("walk.ok") : t("walk.godkand")}
          </span>
        </StatusButton>
        <StatusButton
          active={draft.status === "deviation"}
          tone="deviation"
          onClick={() => onStatus("deviation")}
        >
          <TriangleAlertIcon className="size-4" />
          {locale === "sv" ? t("walk.avvikelse") : t("walk.deviation")}
          <span className="block text-[10px] font-normal opacity-80">
            {locale === "sv" ? t("walk.deviation") : t("walk.avvikelse")}
          </span>
        </StatusButton>
        <StatusButton
          active={draft.status === "na"}
          tone="na"
          onClick={() => onStatus("na")}
        >
          <CircleSlashIcon className="size-4" />
          {locale === "sv" ? t("walk.ejRelevant") : t("walk.na")}
          <span className="block text-[10px] font-normal opacity-80">
            {locale === "sv" ? t("walk.na") : t("walk.ejRelevant")}
          </span>
        </StatusButton>
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
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(event) => attach(event.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              variant="outline"
              className="h-12"
              onClick={() => fileRef.current?.click()}
            >
              <CameraIcon className="size-4" />
              {t("buttons.attachPhoto")}
            </Button>
            {draft.photoPreview && (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={draft.photoPreview}
                  alt="Deviation evidence"
                  className="h-12 w-16 rounded-lg object-cover"
                />
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

function StatusButton({
  active,
  tone,
  onClick,
  children,
}: {
  active: boolean;
  tone: "ok" | "deviation" | "na";
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-14 flex-col items-center justify-center rounded-xl border px-1 text-xs font-semibold leading-tight",
        tone === "ok" &&
          (active
            ? "border-emerald-400 bg-emerald-500 text-slate-950"
            : "border-emerald-500/30 bg-emerald-950/20 text-emerald-200"),
        tone === "deviation" &&
          (active
            ? "border-red-400 bg-red-500 text-white"
            : "border-red-500/35 bg-red-950/30 text-red-200"),
        tone === "na" &&
          (active
            ? "border-slate-400 bg-slate-400 text-slate-950"
            : "border-border bg-secondary/40 text-muted-foreground")
      )}
    >
      {children}
    </button>
  );
}

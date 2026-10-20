"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2Icon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  Loader2Icon,
  LockIcon,
  MinusCircleIcon,
  PlusIcon,
  SendIcon,
  Trash2Icon,
  XCircleIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { can } from "@/lib/auth/permissions";
import { formatDate } from "@/lib/format";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useIncidentStore } from "@/lib/store/incident-store";
import { chipClass, panelClass } from "@/lib/tones";
import { cn } from "@/lib/utils";
import type { Audit, AuditItemResult, AuditItemStatus, ChecklistItem, ChecklistTemplate, Profile } from "@/lib/types";

type Mode = "audits" | "templates";

const STATUS_KEY: Record<Audit["status"], string> = {
  assigned: "audits.statusAssigned",
  "in-progress": "audits.statusInProgress",
  submitted: "audits.statusSubmitted",
  done: "audits.statusDone",
  cancelled: "audits.statusCancelled",
};

function stockholmToday() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(new Date());
}

function slug(index: number) {
  return `item-${index + 1}-${Math.random().toString(36).slice(2, 6)}`;
}

export function AuditsView() {
  const { locale, t } = useLanguage();
  const { role, profile, sites, listTemplates, createTemplate, updateTemplate, listAudits, createAudit, updateAudit, listProfiles } = useIncidentStore();
  const canManage = can(role, "audits.manage");
  const canConduct = can(role, "audits.conduct");
  const [mode, setMode] = useState<Mode>("audits");
  const [templates, setTemplates] = useState<ChecklistTemplate[] | null>(null);
  const [audits, setAudits] = useState<Audit[] | null>(null);
  const [people, setPeople] = useState<Profile[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showAssign, setShowAssign] = useState(false);
  const [showTemplateForm, setShowTemplateForm] = useState(false);

  useEffect(() => {
    if (!canConduct) return;
    let cancelled = false;
    Promise.all([listTemplates(), listAudits(), canManage ? listProfiles() : Promise.resolve([] as Profile[])])
      .then(([tpl, aud, ppl]) => {
        if (cancelled) return;
        setTemplates(tpl);
        setAudits(aud);
        setPeople(ppl.filter((person) => person.active && person.role !== "worker"));
      })
      .catch((caught: { message?: string }) => {
        if (cancelled) return;
        setTemplates([]);
        setAudits([]);
        toast.error(caught?.message ?? "Could not load audits.");
      });
    return () => {
      cancelled = true;
    };
  }, [canConduct, canManage, listTemplates, listAudits, listProfiles]);

  if (!canConduct) {
    return <p className={cn("rounded-xl border px-4 py-3 text-sm", panelClass.warning)}>{t("auth.body")}</p>;
  }

  const open = audits?.find((audit) => audit.id === openId) ?? null;
  const today = stockholmToday();

  function replaceAudit(updated: Audit) {
    setAudits((current) => (current ?? []).map((audit) => (audit.id === updated.id ? updated : audit)));
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-amber-700 uppercase dark:text-amber-400">{t("roles.officerEyebrow")}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("audits.title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("audits.body")}</p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="h-12 gap-2" onClick={() => setMode((value) => (value === "audits" ? "templates" : "audits"))}>
              <ClipboardListIcon className="size-4" />
              {mode === "audits" ? t("audits.manageTemplates") : t("audits.backToAudits")}
            </Button>
            {mode === "audits" && (
              <Button type="button" className="h-12 gap-2" onClick={() => setShowAssign((value) => !value)} disabled={!templates?.length}>
                <PlusIcon className="size-4" />
                {t("audits.assign")}
              </Button>
            )}
            {mode === "templates" && (
              <Button type="button" className="h-12 gap-2" onClick={() => setShowTemplateForm((value) => !value)}>
                <PlusIcon className="size-4" />
                {t("audits.newTemplate")}
              </Button>
            )}
          </div>
        )}
      </div>

      <div className={cn("rounded-2xl border p-4 text-sm", panelClass.info)}>
        <p className="font-semibold">{t("audits.flowTitle")}</p>
        <p className="mt-1 opacity-85">{t("audits.flowBody")}</p>
      </div>

      {mode === "templates" && canManage && (
        <TemplatesPanel
          templates={templates}
          showForm={showTemplateForm}
          onCloseForm={() => setShowTemplateForm(false)}
          onCreate={async (input) => {
            const created = await createTemplate(input);
            setTemplates((current) => [...(current ?? []), created]);
            setShowTemplateForm(false);
          }}
          onToggle={async (template) => {
            const updated = await updateTemplate(template.id, { active: !template.active });
            setTemplates((current) => (current ?? []).map((item) => (item.id === updated.id ? updated : item)));
          }}
        />
      )}

      {mode === "audits" && (
        <>
          {showAssign && canManage && (
            <AssignForm
              templates={(templates ?? []).filter((template) => template.active)}
              people={people}
              sites={sites}
              onCancel={() => setShowAssign(false)}
              onCreate={async (input) => {
                const created = await createAudit(input);
                setAudits((current) => [created, ...(current ?? [])]);
                setShowAssign(false);
                toast.success(t("audits.assigned"));
              }}
            />
          )}

          {audits === null ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />…
            </p>
          ) : audits.length === 0 ? (
            <p className="rounded-2xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">{t("audits.empty")}</p>
          ) : (
            <ul className="space-y-2">
              {audits.map((audit) => {
                const overdue = Boolean(audit.dueDate) && audit.status !== "done" && audit.status !== "cancelled" && audit.dueDate! < today;
                const mine = audit.assigneeId === profile?.id;
                return (
                  <li key={audit.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(openId === audit.id ? null : audit.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-left transition-colors hover:bg-secondary/40",
                        overdue ? "border-red-500/50" : "border-border",
                        openId === audit.id && "ring-2 ring-amber-400/60"
                      )}
                    >
                      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", audit.status === "done" ? chipClass.emerald : audit.openNonConformities ? chipClass.red : chipClass.amber)}>
                        <ClipboardCheckIcon className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">
                          {audit.templateName}
                          {mine && <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">{t("audits.mine")}</span>}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[audit.siteName, audit.assigneeName ?? t("tasks.unassigned"), audit.dueDate ? t("tasks.due", { date: formatDate(`${audit.dueDate}T12:00:00`, locale) }) : null].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-medium", audit.status === "done" ? panelClass.success : overdue ? panelClass.danger : "border-border")}>
                          {t(STATUS_KEY[audit.status])}
                        </span>
                        {audit.openNonConformities > 0 && (
                          <span className="text-[11px] font-medium text-red-700 dark:text-red-300">{t("audits.openNc", { n: audit.openNonConformities })}</span>
                        )}
                      </span>
                    </button>
                    {open?.id === audit.id && (
                      <AuditDetail
                        audit={open}
                        people={people}
                        canManage={canManage}
                        isAssignee={mine}
                        onChange={async (patch) => {
                          try {
                            const updated = await updateAudit(audit.id, patch);
                            replaceAudit(updated);
                            if (patch.status === "submitted") toast.success(t("audits.submittedToast", { n: updated.items.filter((item) => item.status === "fail").length }));
                            else if (patch.status === "done") toast.success(t("audits.closedToast"));
                            else toast.success(t("audits.saved"));
                          } catch (caught) {
                            const message = (caught as { message?: string })?.message ?? "";
                            toast.error(message === "AUDIT_OPEN_NONCONFORMITIES" ? t("audits.cannotClose") : message || t("toast.capaFailed"));
                          }
                        }}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function AssignForm({
  templates,
  people,
  sites,
  onCancel,
  onCreate,
}: {
  templates: ChecklistTemplate[];
  people: Profile[];
  sites: { id: string; name: string }[];
  onCancel: () => void;
  onCreate: (input: { templateId: string; siteId: string | null; assigneeId: string | null; dueDate: string | null }) => Promise<void>;
}) {
  const { t } = useLanguage();
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [siteId, setSiteId] = useState(sites[0]?.id ?? "");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!templateId || !siteId) {
      toast.error(t("audits.needTemplateSite"));
      return;
    }
    setBusy(true);
    try {
      await onCreate({ templateId, siteId, assigneeId: assigneeId || null, dueDate: dueDate || null });
    } catch (caught) {
      toast.error((caught as { message?: string })?.message ?? t("toast.capaFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="audit-template">{t("audits.template")}</Label>
        <select id="audit-template" value={templateId} onChange={(event) => setTemplateId(event.target.value)} className="h-12 w-full rounded-lg border border-border bg-background px-3">
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name} · {t("audits.itemCount", { n: template.items.length })}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="audit-site">{t("people.site")}</Label>
        <select id="audit-site" value={siteId} onChange={(event) => setSiteId(event.target.value)} className="h-12 w-full rounded-lg border border-border bg-background px-3">
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="audit-assignee">{t("tasks.assignee")}</Label>
        <select id="audit-assignee" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} className="h-12 w-full rounded-lg border border-border bg-background px-3">
          <option value="">{t("tasks.unassigned")}</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.fullName} · {t(`roleNames.${person.role}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="audit-due">{t("tasks.dueDate")}</Label>
        <Input id="audit-due" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="h-12" />
      </div>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" variant="outline" className="h-12" onClick={onCancel}>
          {t("buttons.cancel")}
        </Button>
        <Button type="button" className="h-12" disabled={busy} onClick={() => void submit()}>
          {busy ? t("tasks.creating") : t("audits.assign")}
        </Button>
      </div>
    </div>
  );
}

function AuditDetail({
  audit,
  people,
  canManage,
  isAssignee,
  onChange,
}: {
  audit: Audit;
  people: Profile[];
  canManage: boolean;
  isAssignee: boolean;
  onChange: (patch: { status?: Audit["status"]; items?: AuditItemResult[]; note?: string }) => Promise<void>;
}) {
  const { t } = useLanguage();
  const [items, setItems] = useState<AuditItemResult[]>(audit.items);
  const [note, setNote] = useState(audit.note);
  const [busy, setBusy] = useState(false);
  const editable = (isAssignee || canManage) && (audit.status === "assigned" || audit.status === "in-progress");
  const answered = items.filter((item) => item.status !== null).length;
  const fails = items.filter((item) => item.status === "fail");
  const unansweredFails = fails.filter((item) => !item.dueDate);
  const allAnswered = answered === items.length && items.length > 0;
  const summary = useMemo(
    () => ({
      ok: items.filter((item) => item.status === "ok").length,
      fail: fails.length,
      na: items.filter((item) => item.status === "na").length,
    }),
    [items, fails]
  );

  function setItem(key: string, patch: Partial<AuditItemResult>) {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  async function run(patch: Parameters<typeof onChange>[0]) {
    setBusy(true);
    try {
      await onChange(patch);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 space-y-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className={cn("rounded-full px-2 py-0.5", chipClass.emerald)}>{t("audits.okCount", { n: summary.ok })}</span>
        <span className={cn("rounded-full px-2 py-0.5", chipClass.red)}>{t("audits.failCount", { n: summary.fail })}</span>
        <span className={cn("rounded-full px-2 py-0.5", chipClass.neutral)}>{t("audits.naCount", { n: summary.na })}</span>
        <span className="ml-auto">{t("audits.progress", { done: answered, total: items.length })}</span>
      </div>

      <ol className="space-y-3">
        {items.map((item, index) => (
          <li key={item.key} className={cn("rounded-xl border p-3", item.status === "fail" ? "border-red-500/40" : "border-border")}>
            <p className="font-medium">
              <span className="mr-2 text-muted-foreground">{index + 1}.</span>
              {item.title}
            </p>
            {editable ? (
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(["ok", "fail", "na"] as AuditItemStatus[]).map((status) => (
                  <button
                    key={status}
                    type="button"
                    aria-pressed={item.status === status}
                    onClick={() => setItem(item.key, { status })}
                    className={cn(
                      "flex min-h-12 items-center justify-center gap-1.5 rounded-lg border text-sm font-semibold transition-colors",
                      item.status === status
                        ? status === "ok"
                          ? "border-emerald-500 bg-emerald-500 text-slate-950"
                          : status === "fail"
                            ? "border-red-500 bg-red-500 text-white"
                            : "border-slate-400 bg-slate-400 text-slate-950"
                        : "border-border bg-background hover:bg-secondary/60"
                    )}
                  >
                    {status === "ok" ? <CheckCircle2Icon className="size-4" /> : status === "fail" ? <XCircleIcon className="size-4" /> : <MinusCircleIcon className="size-4" />}
                    {t(`audits.${status}`)}
                  </button>
                ))}
              </div>
            ) : (
              <p className={cn("mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium", item.status === "ok" ? chipClass.emerald : item.status === "fail" ? chipClass.red : chipClass.neutral)}>
                {item.status ? t(`audits.${item.status}`) : "—"}
              </p>
            )}
            {(item.status === "fail" || item.note) && (
              <div className="mt-2 space-y-2">
                {editable ? (
                  <Textarea value={item.note} onChange={(event) => setItem(item.key, { note: event.target.value })} placeholder={t("audits.noteHint")} className="min-h-16" />
                ) : (
                  item.note && <p className="text-sm whitespace-pre-line">{item.note}</p>
                )}
                {item.status === "fail" && editable && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs">{t("audits.fixBy")}</Label>
                      <Input type="date" value={item.dueDate ?? ""} onChange={(event) => setItem(item.key, { dueDate: event.target.value || null })} className="h-11" />
                    </div>
                    <div>
                      <Label className="text-xs">{t("audits.responsible")}</Label>
                      <select value={item.assigneeId ?? ""} onChange={(event) => setItem(item.key, { assigneeId: event.target.value || null })} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm">
                        <option value="">{t("tasks.unassigned")}</option>
                        {people.map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.fullName}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
                {item.incidentId && (
                  <Link href={`/dashboard?incidentId=${item.incidentId}`} className="inline-flex items-center gap-2 text-xs font-medium text-amber-700 underline-offset-2 hover:underline dark:text-amber-300">
                    <ClipboardListIcon className="size-3.5" />
                    {item.incidentReference ?? t("audits.hazard")} · {item.incidentStatus ? t(`status.${item.incidentStatus}`) : ""}
                    {item.dueDate ? ` · ${item.dueDate}` : ""}
                    {item.assigneeName ? ` · ${item.assigneeName}` : ""}
                  </Link>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>

      <div className="space-y-2">
        <Label htmlFor={`audit-note-${audit.id}`}>{t("audits.overallNote")}</Label>
        {editable ? (
          <Textarea id={`audit-note-${audit.id}`} value={note} onChange={(event) => setNote(event.target.value)} className="min-h-16" />
        ) : (
          <p className="text-sm text-muted-foreground">{note || "—"}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        {editable && (
          <>
            <Button type="button" variant="outline" className="h-11" disabled={busy} onClick={() => void run({ items, note, status: audit.status === "assigned" ? "in-progress" : undefined })}>
              {t("audits.saveDraft")}
            </Button>
            <Button
              type="button"
              className="h-11 gap-2"
              disabled={busy || !allAnswered}
              title={!allAnswered ? t("audits.answerAll") : unansweredFails.length ? t("audits.fixByHint") : undefined}
              onClick={() => void run({ items, note, status: "submitted" })}
            >
              <SendIcon className="size-4" />
              {t("audits.submit")}
            </Button>
          </>
        )}
        {audit.status === "submitted" && canManage && (
          <Button type="button" className="h-11 gap-2" disabled={busy || audit.openNonConformities > 0} title={audit.openNonConformities > 0 ? t("audits.cannotClose") : undefined} onClick={() => void run({ status: "done" })}>
            {audit.openNonConformities > 0 ? <LockIcon className="size-4" /> : <CheckCircle2Icon className="size-4" />}
            {t("audits.close")}
          </Button>
        )}
        {audit.status === "submitted" && audit.openNonConformities > 0 && (
          <p className={cn("w-full rounded-lg border px-3 py-2 text-sm", panelClass.warning)}>{t("audits.cannotClose")}</p>
        )}
        {audit.status !== "done" && audit.status !== "cancelled" && canManage && (
          <Button type="button" variant="ghost" className="ml-auto h-11 gap-2 text-muted-foreground" disabled={busy} onClick={() => void run({ status: "cancelled" })}>
            <XCircleIcon className="size-4" />
            {t("tasks.cancel")}
          </Button>
        )}
      </div>
    </div>
  );
}

function TemplatesPanel({
  templates,
  showForm,
  onCloseForm,
  onCreate,
  onToggle,
}: {
  templates: ChecklistTemplate[] | null;
  showForm: boolean;
  onCloseForm: () => void;
  onCreate: (input: { name: string; description: string; items: ChecklistItem[] }) => Promise<void>;
  onToggle: (template: ChecklistTemplate) => Promise<void>;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<string[]>(["", "", ""]);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const items = lines.map((line) => line.trim()).filter(Boolean).map((title, index) => ({ key: slug(index), title }));
    if (!name.trim() || items.length === 0) {
      toast.error(t("audits.needNameItems"));
      return;
    }
    setBusy(true);
    try {
      await onCreate({ name, description, items });
      setName("");
      setDescription("");
      setLines(["", "", ""]);
      toast.success(t("audits.templateCreated"));
    } catch (caught) {
      toast.error((caught as { message?: string })?.message ?? t("toast.capaFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {showForm && (
        <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tpl-name">{t("audits.templateName")}</Label>
              <Input id="tpl-name" value={name} onChange={(event) => setName(event.target.value)} placeholder={t("audits.templateNameHint")} className="h-12" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tpl-description">{t("tasks.description")}</Label>
              <Input id="tpl-description" value={description} onChange={(event) => setDescription(event.target.value)} className="h-12" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("audits.items")}</Label>
            <ol className="space-y-2">
              {lines.map((line, index) => (
                <li key={index} className="flex items-center gap-2">
                  <span className="w-6 text-right text-sm text-muted-foreground">{index + 1}.</span>
                  <Input value={line} onChange={(event) => setLines((current) => current.map((value, i) => (i === index ? event.target.value : value)))} placeholder={t("audits.itemHint")} className="h-11" />
                  <Button type="button" variant="ghost" size="icon" className="size-10 text-muted-foreground" aria-label={t("people.remove")} onClick={() => setLines((current) => current.filter((_, i) => i !== index))}>
                    <Trash2Icon className="size-4" />
                  </Button>
                </li>
              ))}
            </ol>
            <Button type="button" variant="outline" size="sm" className="h-10 gap-2" onClick={() => setLines((current) => [...current, ""])}>
              <PlusIcon className="size-4" />
              {t("audits.addItem")}
            </Button>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="h-12" onClick={onCloseForm}>
              {t("buttons.cancel")}
            </Button>
            <Button type="button" className="h-12" disabled={busy} onClick={() => void submit()}>
              {busy ? t("tasks.creating") : t("audits.saveTemplate")}
            </Button>
          </div>
        </div>
      )}

      {templates === null ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" />…
        </p>
      ) : templates.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">{t("audits.noTemplates")}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {templates.map((template) => (
            <li key={template.id} className={cn("rounded-2xl border border-border bg-card p-4", !template.active && "opacity-60")}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{template.name}</p>
                  {template.description && <p className="text-sm text-muted-foreground">{template.description}</p>}
                </div>
                <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" onClick={() => void onToggle(template)}>
                  {template.active ? t("audits.deactivate") : t("audits.activate")}
                </Button>
              </div>
              <ol className="mt-3 space-y-1 text-sm">
                {template.items.map((item, index) => (
                  <li key={item.key} className="flex gap-2">
                    <span className="text-muted-foreground">{index + 1}.</span>
                    <span>{item.title}</span>
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

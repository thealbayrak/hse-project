"use client";

import { useEffect, useState } from "react";
import { CheckCircle2Icon, Loader2Icon, PlayIcon, PlusIcon, RotateCcwIcon, XCircleIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { can } from "@/lib/auth/permissions";
import { formatDate } from "@/lib/format";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useIncidentStore } from "@/lib/store/incident-store";
import { TASK_PRIORITIES, TASK_PRIORITY_KEY, TASK_STATUS_KEY } from "@/lib/tasks/labels";
import { panelClass } from "@/lib/tones";
import { cn } from "@/lib/utils";
import type { Profile, Task, TaskPriority } from "@/lib/types";

const PRIORITY_CLASS: Record<TaskPriority, string> = {
  low: "border-border text-muted-foreground",
  normal: "border-sky-500/40 text-sky-700 dark:text-sky-300",
  high: "border-orange-500/40 text-orange-700 dark:text-orange-300",
  urgent: "border-red-500/50 text-red-700 dark:text-red-300",
};

function stockholmToday() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(new Date());
}

export function TasksView() {
  const { locale, t } = useLanguage();
  const { role, profile, sites, incidents, listTasks, createTask, updateTask, listProfiles } = useIncidentStore();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [people, setPeople] = useState<Profile[]>([]);
  const [filter, setFilter] = useState<"mine" | "all">(can(role, "tasks.assign") ? "all" : "mine");
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [dueDate, setDueDate] = useState("");
  const [incidentId, setIncidentId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [creating, setCreating] = useState(false);
  const canAssign = can(role, "tasks.assign");

  useEffect(() => {
    let cancelled = false;
    Promise.all([listTasks(), canAssign ? listProfiles() : Promise.resolve([] as Profile[])])
      .then(([rows, profiles]) => {
        if (cancelled) return;
        setTasks(rows);
        setPeople(profiles.filter((person) => person.active));
      })
      .catch((caught: { message?: string }) => {
        if (!cancelled) {
          setTasks([]);
          toast.error(caught?.message ?? "Could not load tasks.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [listTasks, listProfiles, canAssign]);

  async function submit() {
    if (!title.trim()) {
      toast.error(t("tasks.needTitle"));
      return;
    }
    setCreating(true);
    try {
      const created = await createTask({
        title,
        description,
        priority,
        assigneeId: assigneeId || null,
        siteId: siteId || null,
        incidentId: incidentId || null,
        dueDate: dueDate || null,
      });
      setTasks((current) => [created, ...(current ?? [])]);
      setTitle("");
      setDescription("");
      setAssigneeId("");
      setDueDate("");
      setIncidentId("");
      setShowForm(false);
      toast.success(t("tasks.created"));
    } catch (caught) {
      toast.error((caught as { message?: string })?.message ?? t("toast.capaFailed"));
    } finally {
      setCreating(false);
    }
  }

  async function change(id: string, patch: Parameters<typeof updateTask>[1]) {
    try {
      const updated = await updateTask(id, patch);
      setTasks((current) => (current ?? []).map((task) => (task.id === id ? updated : task)));
    } catch (caught) {
      toast.error((caught as { message?: string })?.message ?? t("toast.capaFailed"));
    }
  }

  const today = stockholmToday();
  const visible = (tasks ?? []).filter((task) => (filter === "mine" ? task.assigneeId === profile?.id : true));

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-amber-700 uppercase dark:text-amber-400">{t("roles.officerEyebrow")}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("tasks.title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("tasks.body")}</p>
        </div>
        {canAssign && (
          <Button type="button" className="h-12 gap-2" onClick={() => setShowForm((value) => !value)}>
            <PlusIcon className="size-4" />
            {t("tasks.newTask")}
          </Button>
        )}
      </div>

      {showForm && canAssign && (
        <div className="grid gap-4 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="task-title">{t("tasks.titleLabel")}</Label>
            <Input id="task-title" value={title} onChange={(event) => setTitle(event.target.value)} className="h-12" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="task-description">{t("tasks.description")}</Label>
            <Textarea id="task-description" value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-20" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-assignee">{t("tasks.assignee")}</Label>
            <select id="task-assignee" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} className="h-12 w-full rounded-lg border border-border bg-background px-3">
              <option value="">{t("tasks.unassigned")}</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.fullName} · {t(`roleNames.${person.role}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-priority">{t("tasks.priority")}</Label>
            <select id="task-priority" value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)} className="h-12 w-full rounded-lg border border-border bg-background px-3">
              {TASK_PRIORITIES.map((item) => (
                <option key={item} value={item}>
                  {t(TASK_PRIORITY_KEY[item])}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-due">{t("tasks.dueDate")}</Label>
            <Input id="task-due" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="h-12" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-site">{t("people.site")}</Label>
            <select id="task-site" value={siteId} onChange={(event) => setSiteId(event.target.value)} className="h-12 w-full rounded-lg border border-border bg-background px-3">
              <option value="">{t("people.allSites")}</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="task-incident">{t("tasks.linkIncident")}</Label>
            <select id="task-incident" value={incidentId} onChange={(event) => setIncidentId(event.target.value)} className="h-12 w-full rounded-lg border border-border bg-background px-3">
              <option value="">{t("tasks.noIncident")}</option>
              {incidents.slice(0, 50).map((incident) => (
                <option key={incident.id} value={incident.id}>
                  {incident.reference} · {incident.locationName ?? incident.siteName ?? ""}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" className="h-12" onClick={() => setShowForm(false)}>
              {t("buttons.cancel")}
            </Button>
            <Button type="button" className="h-12" disabled={creating} onClick={() => void submit()}>
              {creating ? t("tasks.creating") : t("tasks.create")}
            </Button>
          </div>
        </div>
      )}

      <div role="group" className="inline-flex h-12 items-center rounded-lg border border-border bg-secondary/40 p-1">
        {(["mine", "all"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={filter === mode}
            onClick={() => setFilter(mode)}
            className={cn(
              "inline-flex h-full items-center justify-center rounded-md px-4 text-sm font-medium transition-colors",
              filter === mode ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            {t(`tasks.${mode}`)}
          </button>
        ))}
      </div>

      {tasks === null ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" />…
        </p>
      ) : visible.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">{t("tasks.empty")}</p>
      ) : (
        <ul className="space-y-3">
          {visible.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              overdue={Boolean(task.dueDate) && task.status !== "done" && task.status !== "cancelled" && task.dueDate! < today}
              canAssign={canAssign}
              isMine={task.assigneeId === profile?.id}
              onChange={(patch) => void change(task.id, patch)}
              locale={locale}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function TaskCard({
  task,
  overdue,
  canAssign,
  isMine,
  onChange,
  locale,
}: {
  task: Task;
  overdue: boolean;
  canAssign: boolean;
  isMine: boolean;
  onChange: (patch: Parameters<ReturnType<typeof useIncidentStore>["updateTask"]>[1]) => void;
  locale: "sv" | "en" | "tr";
}) {
  const { t } = useLanguage();
  const [feedback, setFeedback] = useState(task.feedback);
  const closed = task.status === "done" || task.status === "cancelled";

  return (
    <li className={cn("rounded-2xl border bg-card p-4", overdue ? "border-red-500/50" : "border-border", closed && "opacity-75")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{task.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {task.assigneeName ?? t("tasks.unassigned")}
            {task.createdByName ? ` · ${t("tasks.by", { name: task.createdByName })}` : ""}
            {task.incidentReference ? ` · ${task.incidentReference}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium", PRIORITY_CLASS[task.priority])}>{t(TASK_PRIORITY_KEY[task.priority])}</span>
          <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium", task.status === "done" ? panelClass.success : overdue ? panelClass.danger : "border-border")}>
            {overdue ? t("tasks.overdue") : t(TASK_STATUS_KEY[task.status])}
          </span>
        </div>
      </div>
      {task.description && <p className="mt-2 text-sm leading-relaxed whitespace-pre-line">{task.description}</p>}
      <p className="mt-2 text-xs text-muted-foreground">
        {task.dueDate ? t("tasks.due", { date: formatDate(`${task.dueDate}T12:00:00`, locale) }) : ""}
        {task.completedAt ? ` · ${t("tasks.completed", { date: formatDate(task.completedAt, locale) })}` : ""}
      </p>

      {(isMine || canAssign) && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          <Label htmlFor={`feedback-${task.id}`}>{t("tasks.feedback")}</Label>
          <Textarea id={`feedback-${task.id}`} value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder={t("tasks.feedbackHint")} className="min-h-16" />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className="h-10" disabled={feedback === task.feedback} onClick={() => onChange({ feedback })}>
              {t("tasks.saveFeedback")}
            </Button>
            {task.status === "open" && (
              <Button type="button" variant="outline" size="sm" className="h-10 gap-1" onClick={() => onChange({ status: "in-progress" })}>
                <PlayIcon className="size-4" />
                {t("tasks.start")}
              </Button>
            )}
            {!closed && (
              <Button type="button" size="sm" className="h-10 gap-1" onClick={() => onChange({ status: "done", feedback })}>
                <CheckCircle2Icon className="size-4" />
                {t("tasks.markDone")}
              </Button>
            )}
            {closed && (
              <Button type="button" variant="outline" size="sm" className="h-10 gap-1" onClick={() => onChange({ status: "open" })}>
                <RotateCcwIcon className="size-4" />
                {t("tasks.reopen")}
              </Button>
            )}
            {canAssign && !closed && (
              <Button type="button" variant="ghost" size="sm" className="h-10 gap-1 text-muted-foreground" onClick={() => onChange({ status: "cancelled" })}>
                <XCircleIcon className="size-4" />
                {t("tasks.cancel")}
              </Button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

"use client";

import { useEffect, useState } from "react";
import { CalendarPlusIcon, Loader2Icon, PlusIcon, SendIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useIncidentStore } from "@/lib/store/incident-store";
import { panelClass } from "@/lib/tones";
import { cn } from "@/lib/utils";
import type { Contact, Incident } from "@/lib/types";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Next full hour in local time, formatted for <input type="datetime-local">. */
function defaultWhen() {
  const date = new Date(Date.now() + 60 * 60_000);
  date.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function MeetingDialog({
  incident,
  open,
  onClose,
}: {
  incident: Incident;
  open: boolean;
  onClose: () => void;
}) {
  const { locale, t } = useLanguage();
  const { listContacts, addContact, removeContact } = useIncidentStore();
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState(() => t("meeting.defaultTitle", { reference: incident.reference }));
  const [when, setWhen] = useState(defaultWhen);
  const [duration, setDuration] = useState(30);
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("");
  const [sending, setSending] = useState(false);

  // Contacts live in the repository (an external store); load them when the dialog opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listContacts()
      .then((items) => {
        if (!cancelled) setContacts(items);
      })
      .catch(() => {
        if (!cancelled) setContacts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, listContacts]);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function saveContact() {
    if (!newName.trim() || !EMAIL.test(newEmail.trim())) return;
    try {
      const contact = await addContact({ name: newName, email: newEmail, role: newRole || null });
      setContacts((current) => [...(current ?? []), contact].sort((a, b) => a.name.localeCompare(b.name)));
      setSelected((current) => new Set(current).add(contact.id));
      setNewName("");
      setNewEmail("");
      setNewRole("");
      toast.success(t("meeting.contactSaved"));
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : t("meeting.failed"));
    }
  }

  async function deleteContact(id: string) {
    try {
      await removeContact(id);
      setContacts((current) => (current ?? []).filter((contact) => contact.id !== id));
      setSelected((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : t("meeting.failed"));
    }
  }

  async function send() {
    const recipients = (contacts ?? []).filter((contact) => selected.has(contact.id)).map(({ name, email }) => ({ name, email }));
    if (!recipients.length) {
      toast.error(t("meeting.needRecipients"));
      return;
    }
    setSending(true);
    try {
      const response = await fetch("/api/meetings/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: locale,
          incident,
          meeting: {
            incidentId: incident.id,
            title: title.trim(),
            scheduledAt: new Date(when).toISOString(),
            durationMinutes: duration,
            location: location.trim(),
            note: note.trim(),
            recipients,
          },
        }),
      });
      const body = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; recipients?: number } | null;
      if (!response.ok || !body?.ok) throw new Error(body?.error || t("meeting.failed"));
      toast.success(t("meeting.sent", { n: body.recipients ?? recipients.length }));
      onClose();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : t("meeting.failed"));
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="z-[60] max-h-[92dvh] overflow-y-auto sm:max-w-2xl" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlusIcon className="size-5 text-red-600 dark:text-red-400" />
            {t("meeting.plan")}
          </DialogTitle>
          <DialogDescription>{t("meeting.includes")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="meeting-title">{t("meeting.titleLabel")}</Label>
            <Input id="meeting-title" value={title} onChange={(event) => setTitle(event.target.value)} className="h-12" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="meeting-when">{t("meeting.when")}</Label>
            <Input id="meeting-when" type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} className="h-12" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="meeting-duration">{t("meeting.duration")}</Label>
            <Input
              id="meeting-duration"
              type="number"
              min={10}
              max={480}
              step={5}
              value={duration}
              onChange={(event) => setDuration(Number(event.target.value) || 30)}
              className="h-12"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="meeting-location">{t("meeting.location")}</Label>
            <Input id="meeting-location" value={location} onChange={(event) => setLocation(event.target.value)} className="h-12" placeholder="Teams / Zoom / Barack 2" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="meeting-note">{t("meeting.note")}</Label>
            <Textarea id="meeting-note" value={note} onChange={(event) => setNote(event.target.value)} className="min-h-20" />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-secondary/30 p-4">
          <p className="mb-2 text-sm font-semibold">{t("meeting.recipients")}</p>
          {contacts === null ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              …
            </p>
          ) : contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("meeting.noContacts")}</p>
          ) : (
            <ul className="space-y-1.5">
              {contacts.map((contact) => (
                <li key={contact.id} className="flex items-center gap-2">
                  <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-secondary/60">
                    <input
                      type="checkbox"
                      checked={selected.has(contact.id)}
                      onChange={() => toggle(contact.id)}
                      className="size-5 accent-amber-500"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {contact.name}
                        {contact.role ? <span className="font-normal text-muted-foreground"> · {contact.role}</span> : null}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">{contact.email}</span>
                    </span>
                  </label>
                  <Button type="button" variant="ghost" size="icon" className="size-10 text-muted-foreground" aria-label={t("meeting.remove")} onClick={() => void deleteContact(contact.id)}>
                    <Trash2Icon className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-[1fr_1.2fr_1fr_auto]">
            <Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder={t("meeting.name")} className="h-11" />
            <Input type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} placeholder={t("meeting.email")} className="h-11" />
            <Input value={newRole} onChange={(event) => setNewRole(event.target.value)} placeholder={t("meeting.role")} className="h-11" />
            <Button type="button" variant="outline" className="h-11 gap-1" disabled={!newName.trim() || !EMAIL.test(newEmail.trim())} onClick={() => void saveContact()}>
              <PlusIcon className="size-4" />
              {t("meeting.addContact")}
            </Button>
          </div>
        </div>

        {!incident.aiAnalysis && (
          <p className={cn("rounded-xl border px-3 py-2 text-xs", panelClass.warning)}>{t("analysis.generate")} → {t("analysis.title")}</p>
        )}

        <DialogFooter>
          <Button variant="outline" className="h-12" onClick={onClose}>
            {t("buttons.cancel")}
          </Button>
          <Button className="h-12 gap-2" disabled={sending} onClick={() => void send()}>
            <SendIcon className="size-4" />
            {sending ? t("meeting.sending") : t("meeting.send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

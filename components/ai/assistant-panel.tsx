"use client";

import { useRef, useState } from "react";
import { BotIcon, Loader2Icon, SendIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { askAssistant } from "@/lib/ai/client";
import { compactIncidents } from "@/lib/ai/context";
import type { AssistantTurn } from "@/lib/ai/provider";
import { can } from "@/lib/auth/permissions";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useIncidentStore } from "@/lib/store/incident-store";
import { cn } from "@/lib/utils";

const SUGGESTIONS = ["assistant.q1", "assistant.q2", "assistant.q3", "assistant.q4"] as const;

/** Floating assistant for managers: answers questions about the company's own reports. */
export function AssistantPanel() {
  const { locale, t } = useLanguage();
  const { role, incidents, canReadIncidents, profile, sites } = useIncidentStore();
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<AssistantTurn[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  if (!canReadIncidents || !can(role, "dashboard.view")) return null;

  const company = profile?.organizationId ? (sites.find((site) => site.organizationId === profile.organizationId)?.organizationName ?? null) : null;

  async function send(text: string) {
    const clean = text.trim();
    if (!clean || busy) return;
    const before = history;
    setHistory([...before, { role: "user", text: clean }]);
    setQuestion("");
    setBusy(true);
    try {
      const answer = await askAssistant({ question: clean, history: before, incidents: compactIncidents(incidents), language: locale, company });
      setHistory((current) => [...current, { role: "assistant", text: answer || t("assistant.empty") }]);
    } catch {
      setHistory((current) => [...current, { role: "assistant", text: t("assistant.failed") }]);
    } finally {
      setBusy(false);
      window.setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("assistant.title")}
        className="fixed right-4 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-40 flex h-14 items-center gap-2 rounded-full bg-slate-950 px-4 text-sm font-semibold text-amber-400 shadow-lg md:bottom-6 dark:bg-amber-500 dark:text-slate-950"
      >
        <SparklesIcon className="size-5" />
        <span className="hidden sm:inline">{t("assistant.title")}</span>
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b border-border p-4">
            <SheetTitle className="flex items-center gap-2">
              <BotIcon className="size-5 text-amber-600 dark:text-amber-400" />
              {t("assistant.title")}
            </SheetTitle>
            <SheetDescription>{t("assistant.hint", { n: Math.min(incidents.length, 300) })}</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {history.length === 0 && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">{t("assistant.try")}</p>
                {SUGGESTIONS.map((key) => (
                  <button key={key} type="button" onClick={() => void send(t(key))} className="block w-full rounded-xl border border-border bg-card px-3 py-2.5 text-left text-sm hover:bg-secondary/60">
                    {t(key)}
                  </button>
                ))}
              </div>
            )}
            {history.map((turn, index) => (
              <div
                key={index}
                className={cn(
                  "max-w-[90%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-line",
                  turn.role === "user" ? "ml-auto bg-amber-500 text-slate-950" : "bg-secondary text-foreground"
                )}
              >
                {turn.text}
              </div>
            ))}
            {busy && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin" />
                {t("assistant.thinking")}
              </p>
            )}
            <div ref={endRef} />
          </div>
          <form
            className="flex gap-2 border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            onSubmit={(event) => {
              event.preventDefault();
              void send(question);
            }}
          >
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder={t("assistant.placeholder")}
              className="h-12 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-base"
            />
            <Button type="submit" className="h-12 w-12 shrink-0" disabled={busy || question.trim().length < 2} aria-label={t("assistant.send")}>
              <SendIcon className="size-4" />
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}

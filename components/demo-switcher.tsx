"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronUpIcon, EyeIcon, HardHatIcon } from "lucide-react";
import { landingFor } from "@/lib/auth/landing";
import { ORGANIZATIONS } from "@/lib/data/sites";
import { DEMO_PERSONA_IDS, DEMO_WORKER_URL, demoProfile, type DemoPersonaId } from "@/lib/demo/people";
import { choosePersona } from "@/lib/demo/persona";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useIncidentStore } from "@/lib/store/incident-store";
import { cn } from "@/lib/utils";

/**
 * Demo only (no database configured): there are no logins, so this switcher
 * shows the app as each kind of person would see it, with their own company's
 * data. It is never rendered when Supabase is configured.
 */
export function DemoSwitcher() {
  const { t } = useLanguage();
  const router = useRouter();
  const { demoPersona } = useIncidentStore();
  const [open, setOpen] = useState(false);
  if (!demoPersona) return null;

  function label(id: DemoPersonaId) {
    if (id === "worker") return { name: t("demo.worker"), detail: t("demo.workerHint") };
    const person = demoProfile(id);
    const company = ORGANIZATIONS.find((item) => item.id === person?.organizationId)?.name ?? t("demo.allCompanies");
    return { name: person?.fullName ?? id, detail: `${person ? t(`roleNames.${person.role}`) : ""} · ${company}` };
  }

  function choose(id: DemoPersonaId) {
    choosePersona(id);
    setOpen(false);
    const person = demoProfile(id);
    router.push(id === "worker" ? DEMO_WORKER_URL : landingFor(person?.role));
  }

  const current = label(demoPersona);

  return (
    <div className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-3 z-50 md:bottom-4">
      {open && (
        <div role="menu" aria-label={t("demo.viewAs")} className="mb-2 w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl border border-border bg-card p-2 shadow-xl">
          <p className="px-3 pt-2 pb-1 text-xs text-muted-foreground">{t("demo.hint")}</p>
          {DEMO_PERSONA_IDS.map((id) => {
            const item = label(id);
            const active = id === demoPersona;
            return (
              <button
                key={id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => choose(id)}
                className={cn("flex min-h-12 w-full flex-col items-start rounded-xl px-3 py-2 text-left", active ? "bg-amber-500/15 ring-1 ring-amber-500/50" : "hover:bg-secondary/70")}
              >
                <span className="text-sm font-semibold">{item.name}</span>
                <span className="text-xs text-muted-foreground">{item.detail}</span>
              </button>
            );
          })}
        </div>
      )}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex h-12 items-center gap-2 rounded-full border border-amber-500/60 bg-card px-4 text-sm font-semibold shadow-lg"
      >
        {demoPersona === "worker" ? <HardHatIcon className="size-4 text-amber-600" /> : <EyeIcon className="size-4 text-amber-600" />}
        <span className="max-w-40 truncate">
          {t("demo.viewAs")}: {current.name}
        </span>
        <ChevronUpIcon className={cn("size-4 transition-transform", !open && "rotate-180")} />
      </button>
    </div>
  );
}

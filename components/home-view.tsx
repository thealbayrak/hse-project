"use client";

import Link from "next/link";
import { ClipboardPlusIcon, EyeOffIcon, LayoutDashboardIcon, ShieldCheckIcon } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { StatutoryBanner } from "@/components/layout/statutory-banner";
import { APP_NAME } from "@/lib/constants";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useIncidentStore } from "@/lib/store/incident-store";
import { panelClass } from "@/lib/tones";
import { cn } from "@/lib/utils";

export function HomeView() {
  const { t } = useLanguage();
  const { sites } = useIncidentStore();
  const organisations = [...new Set(sites.map((site) => site.organizationName).filter(Boolean))] as string[];

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="rounded-3xl border border-border bg-card px-5 py-8 sm:px-8">
          <p className="text-xs font-semibold tracking-[0.18em] text-amber-700 uppercase dark:text-amber-400">
            {t("header.homeLead")}
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{APP_NAME}</h1>
          <p className="mt-3 max-w-md text-base leading-relaxed text-muted-foreground">{t("header.homeBody")}</p>
          {organisations.length > 0 && (
            <p className="mt-4 flex flex-wrap gap-2">
              {organisations.map((name) => (
                <span key={name} className="rounded-full border border-border bg-secondary/60 px-3 py-1 text-xs font-medium">
                  {name}
                </span>
              ))}
            </p>
          )}
        </div>

        <div className="grid gap-3">
          <Link
            href="/report"
            className="flex min-h-28 items-center gap-4 rounded-2xl border border-amber-500/40 bg-amber-500 px-5 py-5 text-slate-950 transition-transform active:translate-y-px"
          >
            <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-amber-400">
              <ClipboardPlusIcon className="size-7" />
            </span>
            <span>
              <span className="block text-xl font-semibold">{t("roles.worker")}</span>
              <span className="text-sm text-slate-800">{t("roles.workerHint")}</span>
            </span>
          </Link>
          <Link
            href="/dashboard"
            className="flex min-h-28 items-center gap-4 rounded-2xl border border-border bg-card px-5 py-5 transition-colors hover:bg-secondary/50"
          >
            <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-secondary text-amber-700 dark:text-amber-300">
              <LayoutDashboardIcon className="size-7" />
            </span>
            <span>
              <span className="block text-xl font-semibold">{t("roles.officer")}</span>
              <span className="text-sm text-muted-foreground">{t("roles.officerHint")}</span>
            </span>
          </Link>
        </div>

        <div className={cn("flex gap-3 rounded-2xl border p-4", panelClass.info)}>
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-background/60">
            <EyeOffIcon className="size-5" />
          </span>
          <div>
            <p className="font-semibold">{t("header.trustTitle")}</p>
            <p className="mt-1 text-sm leading-relaxed opacity-85">{t("header.trustBody")}</p>
          </div>
        </div>

        <StatutoryBanner compact />

        <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-muted-foreground">
          <ShieldCheckIcon className="mt-0.5 size-4 shrink-0" />
          {t("header.homeFoot")}
        </p>
      </div>
    </AppShell>
  );
}

"use client";

import Link from "next/link";
import { ClipboardPlusIcon, LayoutDashboardIcon } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { StatutoryBanner } from "@/components/layout/statutory-banner";
import { APP_NAME } from "@/lib/constants";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export function HomeView() {
  const { t } = useLanguage();
  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-6">
        <StatutoryBanner />
        <div className="rounded-3xl border border-border bg-card px-5 py-8 sm:px-8">
          <p className="text-xs font-semibold tracking-[0.18em] text-amber-400 uppercase">
            {t("header.homeLead")}
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            {APP_NAME}
          </h1>
          <p className="mt-3 max-w-md text-base leading-relaxed text-muted-foreground">
            {t("header.homeBody")}
          </p>
        </div>

        <div className="grid gap-3">
          <Link
            href="/report"
            className="flex min-h-28 items-center gap-4 rounded-2xl border border-amber-400/40 bg-amber-500 px-5 py-5 text-slate-950 transition-transform active:translate-y-px"
          >
            <span className="flex size-14 items-center justify-center rounded-xl bg-slate-950 text-amber-400">
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
            <span className="flex size-14 items-center justify-center rounded-xl bg-secondary text-amber-300">
              <LayoutDashboardIcon className="size-7" />
            </span>
            <span>
              <span className="block text-xl font-semibold">{t("roles.officer")}</span>
              <span className="text-sm text-muted-foreground">{t("roles.officerHint")}</span>
            </span>
          </Link>
        </div>

        <p className="px-1 text-xs leading-relaxed text-muted-foreground">{t("header.homeFoot")}</p>
      </div>
    </AppShell>
  );
}

"use client";

import Link from "next/link";
import { HardHatIcon, LayoutDashboardIcon } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";
import { useAuth } from "@/lib/auth/auth-context";
import { APP_NAME } from "@/lib/constants";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useIncidentStore } from "@/lib/store/incident-store";
import { panelClass } from "@/lib/tones";
import { cn } from "@/lib/utils";

export function LoginView() {
  const { t } = useLanguage();
  const { enabled } = useAuth();
  const { sites } = useIncidentStore();
  const organisations = [...new Set(sites.map((site) => site.organizationName).filter(Boolean))] as string[];

  return (
    <div className="mx-auto max-w-md space-y-5">
      <div className="rounded-3xl border border-border bg-card px-5 py-7 sm:px-8">
        <div className="flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-xl bg-amber-500 text-slate-950">
            <HardHatIcon className="size-6" />
          </span>
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-amber-700 uppercase dark:text-amber-400">
              {t("auth.eyebrow")}
            </p>
            <p className="text-sm font-semibold">{APP_NAME}</p>
          </div>
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">{t("auth.title")}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("auth.body")}</p>
        {organisations.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">{organisations.join(" · ")}</p>
        )}
        <div className="mt-6">
          {enabled ? (
            <LoginForm />
          ) : (
            <div className="space-y-4">
              <p className={cn("rounded-xl border px-4 py-3 text-sm", panelClass.warning)}>{t("auth.demoMode")}</p>
              <Link
                href="/dashboard"
                className="flex h-12 items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 text-sm font-medium text-slate-950"
              >
                <LayoutDashboardIcon className="size-4" />
                {t("nav.dashboard")}
              </Link>
            </div>
          )}
        </div>
      </div>
      <p className={cn("rounded-2xl border p-4 text-sm leading-relaxed", panelClass.info)}>
        <strong className="font-semibold">{t("header.trustTitle")}.</strong> {t("header.trustBody")}
      </p>
    </div>
  );
}

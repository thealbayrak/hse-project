"use client";

import Link from "next/link";
import { LayoutDashboardIcon } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";
import { useAuth } from "@/lib/auth/auth-context";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export function LoginView() {
  const { t } = useLanguage();
  const { enabled } = useAuth();

  return (
    <div className="mx-auto max-w-md space-y-5">
      <div className="rounded-3xl border border-border bg-card px-5 py-7 sm:px-8">
        <p className="text-xs font-semibold tracking-[0.18em] text-amber-400 uppercase">{t("auth.eyebrow")}</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t("auth.title")}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("auth.body")}</p>
        <div className="mt-6">
          {enabled ? (
            <LoginForm />
          ) : (
            <div className="space-y-4">
              <p className="rounded-xl border border-amber-500/40 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
                {t("auth.demoMode")}
              </p>
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
    </div>
  );
}

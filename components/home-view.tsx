"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ClipboardCheckIcon,
  ClipboardListIcon,
  ClipboardPlusIcon,
  EyeOffIcon,
  KanbanSquareIcon,
  LayoutDashboardIcon,
  LineChartIcon,
  LogInIcon,
  MicIcon,
  QrCodeIcon,
  SearchCheckIcon,
  SettingsIcon,
  ShieldCheckIcon,
  UsersIcon,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { StatutoryBanner } from "@/components/layout/statutory-banner";
import { useAuth } from "@/lib/auth/auth-context";
import { can, type Permission } from "@/lib/auth/permissions";
import { APP_NAME } from "@/lib/constants";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useIncidentStore } from "@/lib/store/incident-store";
import { panelClass } from "@/lib/tones";
import { cn } from "@/lib/utils";

const STAFF_LINKS: { href: string; permission: Permission; titleKey: string; hintKey: string; icon: typeof LayoutDashboardIcon }[] = [
  { href: "/dashboard", permission: "dashboard.view", titleKey: "home.dashboard", hintKey: "home.dashboardHint", icon: LayoutDashboardIcon },
  { href: "/board", permission: "dashboard.view", titleKey: "nav.board", hintKey: "home.boardHint", icon: KanbanSquareIcon },
  { href: "/tasks", permission: "tasks.view", titleKey: "home.tasks", hintKey: "home.tasksHint", icon: ClipboardListIcon },
  { href: "/reports", permission: "reports.view", titleKey: "home.reports", hintKey: "home.reportsHint", icon: LineChartIcon },
  { href: "/audits", permission: "audits.conduct", titleKey: "home.audits", hintKey: "home.auditsHint", icon: ClipboardCheckIcon },
  { href: "/people", permission: "people.manage", titleKey: "home.people", hintKey: "home.peopleHint", icon: UsersIcon },
  { href: "/settings", permission: "settings.manage", titleKey: "home.settings", hintKey: "home.settingsHint", icon: SettingsIcon },
  { href: "/projects", permission: "projects.manage", titleKey: "home.projects", hintKey: "home.projectsHint", icon: QrCodeIcon },
];

export function HomeView() {
  const { t } = useLanguage();
  const { enabled: authEnabled, session, email } = useAuth();
  const { sites, profile, profileError, role, listTasks, isSignedIn } = useIncidentStore();
  const organisations = [...new Set(sites.map((site) => site.organizationName).filter(Boolean))] as string[];
  const signedIn = isSignedIn;
  const staffLinks = STAFF_LINKS.filter((link) => can(role, link.permission));
  const [myOpenTasks, setMyOpenTasks] = useState<number | null>(null);

  useEffect(() => {
    if (!signedIn || !can(role, "tasks.view")) return;
    let cancelled = false;
    listTasks()
      .then((tasks) => {
        if (cancelled) return;
        const mine = tasks.filter((task) => (profile ? task.assigneeId === profile.id : false) && (task.status === "open" || task.status === "in-progress"));
        setMyOpenTasks(mine.length);
      })
      .catch(() => {
        if (!cancelled) setMyOpenTasks(null);
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn, role, profile, listTasks]);

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

        {/* Field side: report and follow up, no account. */}
        <div className="grid gap-3">
          {signedIn ? (
            <Link
              href="/report"
              className="flex min-h-28 items-center gap-4 rounded-2xl border border-amber-500/40 bg-amber-500 px-5 py-5 text-slate-950 transition-transform active:translate-y-px"
            >
              <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-amber-400">
                <ClipboardPlusIcon className="size-7" />
              </span>
              <span className="min-w-0">
                <span className="block text-xl font-semibold">{t("home.reportTitle")}</span>
                <span className="flex items-center gap-1.5 text-sm text-slate-800">
                  <MicIcon className="size-3.5 shrink-0" />
                  {t("home.reportHint")}
                </span>
              </span>
            </Link>
          ) : (
            <div className={cn("flex items-start gap-4 rounded-2xl border px-5 py-5", panelClass.info)}>
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-secondary">
                <QrCodeIcon className="size-6" />
              </span>
              <span className="min-w-0">
                <span className="block text-lg font-semibold">{t("report.scanTitle")}</span>
                <span className="block text-sm opacity-85">{t("report.scanBody")}</span>
              </span>
            </div>
          )}
          <Link
            href="/track"
            className="flex min-h-16 items-center gap-4 rounded-2xl border border-border bg-card px-5 py-3 transition-colors hover:bg-secondary/50"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-amber-700 dark:text-amber-300">
              <SearchCheckIcon className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold">{t("home.trackTitle")}</span>
              <span className="block text-sm text-muted-foreground">{t("home.trackHint")}</span>
            </span>
          </Link>
        </div>

        {/* Safety organisation: shortcuts by role once signed in. */}
        <section className="rounded-3xl border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{t("home.staffTitle")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {signedIn
                  ? t("home.signedInAs", { name: profile?.fullName ?? email ?? "—", role: role ? t(`roleNames.${role}`) : "—" })
                  : t("home.staffHint")}
              </p>
            </div>
            {!signedIn && (
              <Link
                href="/login"
                className="inline-flex h-11 shrink-0 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-medium text-white dark:bg-white dark:text-slate-950"
              >
                <LogInIcon className="size-4" />
                {t("auth.signIn")}
              </Link>
            )}
          </div>
          {signedIn && authEnabled && profile === null && (
            <p className={cn("mt-3 rounded-xl border px-3 py-2 text-sm", panelClass.warning)}>
              {profileError ? t("home.profileError", { error: profileError }) : t("home.noProfile")}
            </p>
          )}
          {signedIn && myOpenTasks !== null && myOpenTasks > 0 && (
            <Link href="/tasks" className={cn("mt-3 block rounded-xl border px-3 py-2 text-sm font-medium", panelClass.info)}>
              {t("home.myTasks", { n: myOpenTasks })}
            </Link>
          )}
          {signedIn && staffLinks.length > 0 && (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {staffLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex min-h-16 items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3 transition-colors hover:bg-secondary/50"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-amber-700 dark:text-amber-300">
                    <link.icon className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold">{t(link.titleKey)}</span>
                    <span className="block truncate text-xs text-muted-foreground">{t(link.hintKey)}</span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

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

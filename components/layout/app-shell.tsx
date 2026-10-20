"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ClipboardCheckIcon,
  ClipboardListIcon,
  ClipboardPlusIcon,
  CloudOffIcon,
  HardHatIcon,
  LayoutDashboardIcon,
  LineChartIcon,
  LogOutIcon,
  QrCodeIcon,
  SettingsIcon,
  ShieldCheckIcon,
  UsersIcon,
} from "lucide-react";
import { AssistantPanel } from "@/components/ai/assistant-panel";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";
import { useAuth } from "@/lib/auth/auth-context";
import { can, type Permission } from "@/lib/auth/permissions";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useIncidentStore } from "@/lib/store/incident-store";
import { panelClass } from "@/lib/tones";

const NAV: { href: string; key: string; icon: typeof ShieldCheckIcon; permission?: Permission; mobile: boolean }[] = [
  { href: "/", key: "nav.home", icon: ShieldCheckIcon, mobile: true },
  { href: "/report", key: "nav.report", icon: ClipboardPlusIcon, mobile: true },
  { href: "/dashboard", key: "nav.dashboard", icon: LayoutDashboardIcon, mobile: true },
  { href: "/tasks", key: "home.tasks", icon: ClipboardListIcon, permission: "tasks.view", mobile: true },
  { href: "/reports", key: "home.reports", icon: LineChartIcon, permission: "reports.view", mobile: true },
  { href: "/audits", key: "home.audits", icon: ClipboardCheckIcon, permission: "audits.conduct", mobile: false },
  { href: "/people", key: "home.people", icon: UsersIcon, permission: "people.manage", mobile: false },
  { href: "/settings", key: "home.settings", icon: SettingsIcon, permission: "settings.manage", mobile: false },
  { href: "/projects", key: "home.projects", icon: QrCodeIcon, permission: "projects.manage", mobile: false },
];

export function AppShell({
  children,
  eyebrow,
  title,
}: {
  children: React.ReactNode;
  eyebrow?: string;
  title?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLanguage();
  const { enabled: authEnabled, session, email, signOut } = useAuth();
  const { pendingCount, syncQueuedReports, role } = useIncidentStore();
  const heading = pageHeading(pathname, t);
  // Signed-in roles see their own pages; everyone else sees the three public tabs.
  const nav = NAV.filter((item) => !item.permission || ((!authEnabled || session) && can(role, item.permission)));
  const mobileNav = nav.filter((item) => item.mobile);

  async function handleSignOut() {
    await signOut();
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-4">
          <Link href="/" className="flex min-h-12 min-w-0 items-center gap-2.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-slate-950">
              <HardHatIcon className="size-5" />
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-semibold tracking-tight">{APP_NAME}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{t("nav.tagline")}</span>
            </span>
          </Link>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <nav className="hidden items-center gap-1 md:flex">
              {nav.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "inline-flex h-11 items-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
                    )}
                  >
                    <item.icon className="size-4" />
                    {t(item.key)}
                  </Link>
                );
              })}
            </nav>
            <LanguageToggle />
            <ThemeToggle />
            {authEnabled && session && (
              <button
                type="button"
                onClick={() => void handleSignOut()}
                title={email ? t("auth.signedInAs", { email }) : t("auth.signOut")}
                aria-label={t("auth.signOut")}
                className="inline-flex size-11 items-center justify-center rounded-full border border-border bg-secondary/50 text-muted-foreground transition-colors hover:text-foreground lg:w-auto lg:gap-2 lg:px-3"
              >
                <LogOutIcon className="size-4" />
                <span className="hidden text-sm font-medium lg:inline">{t("auth.signOut")}</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {pendingCount > 0 && (
        <button
          type="button"
          onClick={() => void syncQueuedReports()}
          className={cn(
            "flex w-full items-center justify-center gap-2 border-b px-4 py-2 text-xs font-medium",
            panelClass.warning,
            "rounded-none"
          )}
        >
          <CloudOffIcon className="size-4 text-amber-600 dark:text-amber-400" />
          {t("offline.pending", { n: pendingCount })}
        </button>
      )}

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-5 pb-[calc(7rem+env(safe-area-inset-bottom))] md:pb-10">
        {(eyebrow || title || heading) && (
          <div className="mb-5">
            {(eyebrow || heading?.eyebrow) && (
              <p className="text-xs font-semibold tracking-[0.16em] text-amber-700 uppercase dark:text-amber-400">
                {eyebrow || heading?.eyebrow}
              </p>
            )}
            {(title || heading?.title) && (
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title || heading?.title}</h1>
            )}
          </div>
        )}
        {children}
      </main>

      {!pathname.startsWith("/report") && !pathname.startsWith("/track") && !pathname.startsWith("/login") && <AssistantPanel />}

      <nav
        data-app-tabbar
        className="fixed inset-x-0 bottom-[var(--kb-inset,0px)] z-40 border-t border-border bg-background/95 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md md:hidden"
      >
        <div
          className="mx-auto grid max-w-lg gap-1"
          style={{ gridTemplateColumns: `repeat(${mobileNav.length}, minmax(0, 1fr))` }}
        >
          {mobileNav.map((item) => {
            const active = pathname === item.href;
            const isReport = item.href === "/report";
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium",
                  isReport && !active && "text-amber-700 dark:text-amber-400",
                  active
                    ? isReport
                      ? "bg-amber-500 text-slate-950"
                      : "bg-secondary text-foreground"
                    : "text-muted-foreground"
                )}
              >
                <item.icon className="size-5" />
                {t(item.key)}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function pageHeading(pathname: string, t: (key: string) => string) {
  if (pathname.startsWith("/report")) {
    return { eyebrow: t("roles.workerEyebrow"), title: t("header.reportTitle") };
  }
  if (pathname.startsWith("/skyddsrond")) {
    return { eyebrow: t("roles.samOfficerEyebrow"), title: t("header.skyddsrondTitle") };
  }
  if (pathname.startsWith("/dashboard")) {
    return { eyebrow: t("roles.officerEyebrow"), title: t("header.dashboardTitle") };
  }
  // /tasks, /reports and /people render their own heading.
  return null;
}

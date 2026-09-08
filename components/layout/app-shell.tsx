"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardPlusIcon, HardHatIcon, LayoutDashboardIcon, ShieldCheckIcon } from "lucide-react";
import { LanguageToggle } from "@/components/LanguageToggle";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";
import { useLanguage } from "@/lib/i18n/LanguageContext";

const NAV = [
  { href: "/", key: "nav.home", icon: ShieldCheckIcon },
  { href: "/report", key: "nav.report", icon: ClipboardPlusIcon },
  { href: "/dashboard", key: "nav.dashboard", icon: LayoutDashboardIcon },
] as const;

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
  const { t } = useLanguage();
  const heading = pageHeading(pathname, t);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-4">
          <Link href="/" className="flex min-h-12 min-w-0 items-center gap-2.5">
            <span className="flex size-10 items-center justify-center rounded-lg bg-amber-500 text-slate-950">
              <HardHatIcon className="size-5" />
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-semibold tracking-tight">{APP_NAME}</span>
              <span className="block text-[11px] text-muted-foreground">{t("nav.tagline")}</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <nav className="hidden items-center gap-1 md:flex">
              {NAV.map((item) => {
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
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-5 pb-28 md:pb-10">
        {(eyebrow || title || heading) && (
          <div className="mb-5">
            {(eyebrow || heading?.eyebrow) && (
              <p className="text-xs font-semibold tracking-[0.16em] text-amber-400 uppercase">
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

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md md:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-3 gap-1">
          {NAV.map((item) => {
            const active = pathname === item.href;
            const isReport = item.href === "/report";
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium",
                  isReport && !active && "text-amber-400",
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
  return null;
}

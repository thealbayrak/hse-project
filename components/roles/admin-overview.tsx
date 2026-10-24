"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ClipboardCheckIcon, FlaskConicalIcon, KanbanSquareIcon, ShieldCheckIcon, UserXIcon } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { adminOverview } from "@/lib/roles/queries";
import { useIncidentStore } from "@/lib/store/incident-store";
import { cn } from "@/lib/utils";

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** The HSE manager's strip above the dashboard: what is stuck, and shortcuts to audits and the other role pages. */
export function AdminOverview() {
  const { t } = useLanguage();
  const { incidents } = useIncidentStore();
  const counts = useMemo(() => adminOverview(incidents, today()), [incidents]);

  const tiles = [
    { label: t("flow.overviewUnassigned"), value: counts.unassigned, icon: UserXIcon, href: "/board", warn: counts.unassigned > 0 },
    { label: t("flow.overviewInvestigations"), value: counts.investigationsOpen, icon: FlaskConicalIcon, href: "/dashboard/investigations", warn: false },
    { label: t("flow.overviewOverdue"), value: counts.investigationsOverdue, icon: FlaskConicalIcon, href: "/dashboard/investigations", warn: counts.investigationsOverdue > 0 },
    { label: t("flow.overviewVerify"), value: counts.awaitingVerification, icon: ShieldCheckIcon, href: "/dashboard/follow-ups", warn: false },
  ];

  return (
    <section aria-label={t("flow.adminTitle")} className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Link
            key={tile.label}
            href={tile.href}
            className={cn("flex items-center gap-3 rounded-2xl border bg-card p-3 transition-colors hover:bg-secondary/50", tile.warn ? "border-amber-500/50" : "border-border")}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
              <tile.icon className="size-5 text-amber-700 dark:text-amber-300" />
            </span>
            <span className="min-w-0">
              <span className="block text-2xl leading-none font-semibold tabular-nums">{tile.value}</span>
              <span className="block truncate text-xs text-muted-foreground">{tile.label}</span>
            </span>
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href="/audits" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-secondary/60">
          <ClipboardCheckIcon className="size-4" />
          {t("flow.checklistsAudits")}
        </Link>
        <Link href="/board" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-secondary/60">
          <KanbanSquareIcon className="size-4" />
          {t("nav.board")}
        </Link>
      </div>
    </section>
  );
}

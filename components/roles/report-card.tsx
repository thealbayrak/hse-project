"use client";

import { useState } from "react";
import { categoriesLabel, placeLabel, relativeTime, severityLabel, statusLabel, typeLabel } from "@/lib/format";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { incidentCategories, type Incident } from "@/lib/types";
import { severityBarClass, severityClass, statusClass } from "@/lib/tones";
import { cn } from "@/lib/utils";

/** The people on a report as a small line of labelled names. */
export function PeopleLine({ incident }: { incident: Incident }) {
  const { t } = useLanguage();
  const a = incident.assignment;
  const owner = a?.actionOwnerName || incident.capa?.assigneeName || null;
  // The area responsible is only known once someone has been put on the report; it is not a gap to warn about.
  const entries = [
    ...(a?.areaResponsibleName ? ([[t("flow.areaResponsible"), a.areaResponsibleName]] as const) : []),
    [t("flow.actionOwner"), owner],
    [t("flow.investigator"), a?.investigatorName],
    [t("flow.followUp"), a?.followUpName],
  ] as const;
  return (
    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {entries.map(([label, name]) => (
        <div key={label} className="flex gap-1">
          <dt className="text-muted-foreground">{label}:</dt>
          <dd className={cn("font-medium", !name && "text-amber-700 dark:text-amber-300")}>{name || t("flow.notAssigned")}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One report as a card for the role pages; the page puts its own controls in `children`. */
export function ReportCard({
  incident,
  badge,
  children,
}: {
  incident: Incident;
  /** A short coloured label next to the reference, e.g. "Overdue". */
  badge?: { text: string; tone: "danger" | "warning" | "success" | "info" };
  children?: React.ReactNode;
}) {
  const { locale, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const categories = incidentCategories(incident);
  const long = incident.description.length > 220;
  const badgeClass = {
    danger: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
    warning: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
    success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    info: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  };

  return (
    <article className="flex overflow-hidden rounded-2xl border border-border bg-card">
      <span className={cn("w-1.5 shrink-0", severityBarClass[incident.severity])} title={severityLabel(incident.severity, locale)} />
      <div className="min-w-0 flex-1 space-y-3 p-4">
        <header className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-amber-700 dark:text-amber-300">{incident.reference}</span>
          <h3 className="text-sm font-semibold">{typeLabel(incident.type, locale, incident.typeNote)}</h3>
          <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", severityClass[incident.severity])}>{severityLabel(incident.severity, locale)}</span>
          <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", statusClass[incident.status])}>{statusLabel(incident.status, locale)}</span>
          {badge && <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", badgeClass[badge.tone])}>{badge.text}</span>}
          <span className="ml-auto text-xs text-muted-foreground">{relativeTime(incident.createdAt, locale)}</span>
        </header>
        <p className="text-xs text-muted-foreground">
          {placeLabel(incident)}
          {categories.length ? ` · ${categoriesLabel(categories, locale)}` : ""}
          {incident.subcontractor ? ` · ${incident.subcontractor}` : ""}
        </p>
        <p className={cn("text-sm leading-relaxed whitespace-pre-line", !open && long && "line-clamp-3")}>{incident.description}</p>
        {long && (
          <button type="button" onClick={() => setOpen((value) => !value)} className="text-xs font-semibold underline underline-offset-2">
            {open ? t("flow.showLess") : t("flow.showMore")}
          </button>
        )}
        {incident.mediaUrls.length > 0 && (
          <div className="flex gap-2">
            {incident.mediaUrls.slice(0, 4).map((url, index) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={url.slice(0, 40) + index} src={url} alt={`${incident.reference} ${index + 1}`} className="size-16 rounded-lg object-cover" />
            ))}
          </div>
        )}
        <PeopleLine incident={incident} />
        {children}
      </div>
    </article>
  );
}

/** A heading with the explanation of a role page. */
export function RoleHeader({ eyebrow, title, hint }: { eyebrow: string; title: string; hint: string }) {
  return (
    <div>
      <p className="text-xs font-semibold tracking-[0.16em] text-amber-700 uppercase dark:text-amber-400">{eyebrow}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return <p className="rounded-2xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">{text}</p>;
}

"use client";

import { useState } from "react";
import { toast } from "sonner";
import { categoriesLabel, placeLabel, relativeTime, severityLabel, statusLabel, typeLabel } from "@/lib/format";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useIncidentStore } from "@/lib/store/incident-store";
import { cn } from "@/lib/utils";
import { severityBarClass, severityClass, statusClass } from "@/lib/tones";
import { incidentCategories, type Incident, type IncidentStatus } from "@/lib/types";

const COLUMNS: IncidentStatus[] = ["open", "in-progress", "resolved"];

/** Column titles: open also holds everything still unassigned or waiting for a rating. */
const COLUMN_KEY: Record<IncidentStatus, string> = {
  open: "board.colOpen",
  "in-progress": "board.colInProgress",
  resolved: "board.colResolved",
};

/**
 * Kanban view of the feed. Native HTML5 drag and drop on desktop; on touch
 * devices the card opens the detail dialog where the status can be changed.
 */
export function IncidentBoard({
  incidents,
  highlightedIds,
  onOpen,
}: {
  incidents: Incident[];
  highlightedIds: string[];
  onOpen: (incidentId: string) => void;
}) {
  const { locale, t } = useLanguage();
  const { updateStatus } = useIncidentStore();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<IncidentStatus | null>(null);

  async function drop(status: IncidentStatus, incidentId: string | null) {
    setOver(null);
    setDragging(null);
    if (!incidentId) return;
    const incident = incidents.find((item) => item.id === incidentId);
    if (!incident || incident.status === status) return;
    try {
      await updateStatus(incidentId, status);
      toast.success(t("board.moved", { status: statusLabel(status, locale) }));
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : t("toast.capaFailed"));
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{t("board.hint")}</p>
      <div className="grid gap-3 md:grid-cols-3">
        {COLUMNS.map((status) => {
          const cards = incidents.filter((incident) => incident.status === status);
          return (
            <section
              key={status}
              aria-label={t(COLUMN_KEY[status])}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                if (over !== status) setOver(status);
              }}
              onDragLeave={() => setOver((current) => (current === status ? null : current))}
              onDrop={(event) => {
                event.preventDefault();
                void drop(status, event.dataTransfer.getData("text/plain") || dragging);
              }}
              className={cn(
                "flex min-h-40 flex-col rounded-2xl border bg-secondary/30 p-2 transition-colors",
                over === status ? "border-amber-500 bg-amber-500/10" : "border-border"
              )}
            >
              <header className="flex items-center justify-between px-2 py-1.5">
                <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-semibold", statusClass[status])}>
                  {t(COLUMN_KEY[status])}
                </span>
                <span className="text-xs text-muted-foreground">{cards.length}</span>
              </header>
              <div className="flex flex-1 flex-col gap-2">
                {cards.map((incident) => (
                  <BoardCard
                    key={incident.id}
                    incident={incident}
                    highlighted={highlightedIds.includes(incident.id)}
                    dragging={dragging === incident.id}
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", incident.id);
                      event.dataTransfer.effectAllowed = "move";
                      setDragging(incident.id);
                    }}
                    onDragEnd={() => setDragging(null)}
                    onOpen={() => onOpen(incident.id)}
                  />
                ))}
                {!cards.length && (
                  <p className="px-2 py-6 text-center text-xs text-muted-foreground">{t("board.empty")}</p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function BoardCard({
  incident,
  highlighted,
  dragging,
  onDragStart,
  onDragEnd,
  onOpen,
}: {
  incident: Incident;
  highlighted: boolean;
  dragging: boolean;
  onDragStart: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onOpen: () => void;
}) {
  const { locale, t } = useLanguage();
  const owner = incident.capa?.assigneeName;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "flex cursor-grab overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm transition-opacity active:cursor-grabbing",
        dragging && "opacity-50",
        highlighted && "ring-2 ring-amber-400"
      )}
    >
      <span className={cn("w-1.5 shrink-0", severityBarClass[incident.severity])} />
      <div className="min-w-0 flex-1 px-3 py-2.5">
        <p className="flex items-center justify-between gap-2 text-xs">
          <span className="font-mono text-amber-700 dark:text-amber-300">{incident.reference}</span>
          <span className="text-muted-foreground">{relativeTime(incident.createdAt, locale)}</span>
        </p>
        <p className="mt-1 truncate text-sm font-semibold">{typeLabel(incident.type, locale, incident.typeNote)}</p>
        <p className="truncate text-xs text-muted-foreground">
          {placeLabel(incident)} · {categoriesLabel(incidentCategories(incident), locale)}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {incident.severity === "unrated" && (
            <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", severityClass.unrated)}>
              {severityLabel("unrated", locale)}
            </span>
          )}
          <span className={cn("truncate text-xs", owner ? "text-foreground" : "font-medium text-amber-700 dark:text-amber-300")}>
            {owner ?? t("dashboard.noOwner")}
          </span>
          {incident.capa?.dueDate && <span className="text-[11px] text-muted-foreground">· {incident.capa.dueDate}</span>}
        </div>
      </div>
    </div>
  );
}

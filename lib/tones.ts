import type { IncidentStatus, Severity } from "@/lib/types";

export const severityClass: Record<Severity, string> = {
  low: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
  medium: "border-amber-500/35 bg-amber-500/15 text-amber-300",
  high: "border-orange-500/40 bg-orange-500/15 text-orange-300",
  critical: "border-red-500/45 bg-red-500/18 text-red-300",
};

export const severityBarClass: Record<Severity, string> = {
  low: "bg-emerald-500",
  medium: "bg-amber-400",
  high: "bg-orange-500",
  critical: "bg-red-500",
};

export const statusClass: Record<IncidentStatus, string> = {
  open: "border-sky-500/30 bg-sky-500/15 text-sky-300",
  "in-progress": "border-amber-500/35 bg-amber-500/15 text-amber-300",
  resolved: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
};

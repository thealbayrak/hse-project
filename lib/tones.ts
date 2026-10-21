import type { IncidentStatus, Severity } from "@/lib/types";

/**
 * Colour helpers that read in both themes: a tinted surface with a dark text
 * colour in light mode, and a translucent surface with a light text colour
 * in dark mode.
 */
export const severityClass: Record<Severity, string> = {
  unrated: "border-violet-500/40 bg-violet-50 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300",
  low: "border-emerald-500/40 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  medium: "border-amber-500/40 bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  high: "border-orange-500/40 bg-orange-50 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300",
  critical: "border-red-500/45 bg-red-50 text-red-800 dark:bg-red-500/18 dark:text-red-300",
};

export const severityBarClass: Record<Severity, string> = {
  unrated: "bg-violet-500",
  low: "bg-emerald-500",
  medium: "bg-amber-400",
  high: "bg-orange-500",
  critical: "bg-red-500",
};

export const statusClass: Record<IncidentStatus, string> = {
  open: "border-sky-500/40 bg-sky-50 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
  "in-progress": "border-amber-500/40 bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  resolved: "border-emerald-500/40 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
};

/** Tinted panels (warnings, hints) that work on both backgrounds. */
export const panelClass = {
  danger: "border-red-500/40 bg-red-50 text-red-900 dark:bg-red-950/60 dark:text-red-50",
  warning: "border-amber-500/40 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-50",
  success: "border-emerald-500/40 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-50",
  info: "border-sky-500/40 bg-sky-50 text-sky-900 dark:bg-sky-950/40 dark:text-sky-50",
} as const;

/** Icon chips next to metrics and section headers. */
export const chipClass = {
  neutral: "bg-secondary text-foreground",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  red: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
} as const;

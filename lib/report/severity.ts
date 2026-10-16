import type { IncidentType, Severity } from "@/lib/types";

export interface SeverityAnswers {
  /** Was anyone hurt? */
  hurt: boolean | null;
  /** Is the danger still present? */
  danger: boolean | null;
}

/**
 * Workers answer two plain questions; the severity is derived from them and the
 * safety officer can correct it on the dashboard. Keeping the classification out
 * of the worker's hands avoids both under-reporting and false critical alarms.
 */
export function deriveSeverity(type: IncidentType, answers: SeverityAnswers): Severity | null {
  if (answers.hurt === null || answers.danger === null) return null;
  if (answers.hurt && answers.danger) return "critical";
  if (answers.hurt || answers.danger) return "high";
  return type === "hazard" ? "low" : "medium";
}

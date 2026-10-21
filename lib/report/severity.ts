import { isPositiveType, type IncidentType, type Severity } from "@/lib/types";

export interface SeverityAnswers {
  /** Was anyone hurt? */
  hurt: boolean | null;
  /** Is the danger still present? */
  danger: boolean | null;
}

/**
 * What the reporter's answers hint at, shown to a manager as a suggestion they
 * may accept or ignore. Missing answers count as "no"; with none at all there is no hint.
 * Nothing is stored from this: the severity is always rated by a manager.
 */
export function suggestSeverity(
  type: IncidentType,
  answers: { hurt?: boolean | null; danger?: boolean | null }
): Severity | null {
  if (isPositiveType(type)) return null;
  if ((answers.hurt ?? null) === null && (answers.danger ?? null) === null) return null;
  return deriveSeverity(type, { hurt: answers.hurt ?? false, danger: answers.danger ?? false });
}

/**
 * The two plain questions mapped to a level. Used only to suggest a level to the
 * manager (see suggestSeverity); a report is never rated from the answers alone.
 */
export function deriveSeverity(type: IncidentType, answers: SeverityAnswers): Severity | null {
  // Good practice is never a risk: no questions needed.
  if (isPositiveType(type)) return "low";
  if (answers.hurt === null || answers.danger === null) return null;
  if (answers.hurt && answers.danger) return "critical";
  if (answers.hurt || answers.danger) return "high";
  return type === "hazard" ? "low" : "medium";
}

import type { Incident } from "@/lib/types";

/** Reports that are reports from the field (not walk items) and still matter. */
const isReport = (incident: Incident) => incident.source !== "skyddsrond";

/** True when nobody has been asked to fix this yet. */
export function needsActionOwner(incident: Incident) {
  return isReport(incident) && incident.status !== "resolved" && !incident.assignment?.actionOwnerId && !incident.capa?.assigneeId;
}

/** Reports the person is the action owner of, open ones first. */
export function actionsFor(incidents: Incident[], profileId: string | null | undefined) {
  if (!profileId) return [];
  return incidents
    .filter((incident) => incident.assignment?.actionOwnerId === profileId || incident.capa?.assigneeId === profileId)
    .sort((a, b) => Number(a.status === "resolved") - Number(b.status === "resolved") || a.createdAt.localeCompare(b.createdAt));
}

/**
 * Reports that call for an investigation. An investigator sees the ones they were
 * named on; people who see everything (managers, safety officers) see all of them.
 */
export function investigationsFor(incidents: Incident[], profileId: string | null | undefined, seesAll: boolean) {
  return incidents
    .filter((incident) => incident.assignment?.investigationRequired)
    .filter((incident) => seesAll || (profileId && incident.assignment?.investigatorId === profileId))
    .sort((a, b) => {
      const doneA = a.assignment?.investigationStatus === "done" ? 1 : 0;
      const doneB = b.assignment?.investigationStatus === "done" ? 1 : 0;
      if (doneA !== doneB) return doneA - doneB;
      return (a.assignment?.investigationDueDate ?? "9999").localeCompare(b.assignment?.investigationDueDate ?? "9999");
    });
}

export function investigationOverdue(incident: Incident, today: string) {
  const assignment = incident.assignment;
  return Boolean(
    assignment?.investigationRequired &&
      assignment.investigationStatus !== "done" &&
      assignment.investigationDueDate &&
      assignment.investigationDueDate < today
  );
}

/** Finished actions waiting for the follow-up person to check them (oldest first). */
export function awaitingVerification(incidents: Incident[], profileId: string | null | undefined, seesAll: boolean) {
  return incidents
    .filter((incident) => incident.assignment?.followUpStatus === "pending")
    .filter((incident) => seesAll || (profileId && incident.assignment?.followUpId === profileId))
    .sort((a, b) => (a.capa?.updatedAt ?? a.createdAt).localeCompare(b.capa?.updatedAt ?? b.createdAt));
}

/** Actions this person has already decided on (approved or sent back), newest first. */
export function verifiedBy(incidents: Incident[], profileId: string | null | undefined, seesAll: boolean) {
  return incidents
    .filter((incident) => incident.assignment?.followUpStatus === "approved" || incident.assignment?.followUpStatus === "rejected")
    .filter((incident) => seesAll || (profileId && incident.assignment?.followUpId === profileId))
    .sort((a, b) => (b.assignment?.verifiedAt ?? "").localeCompare(a.assignment?.verifiedAt ?? ""));
}

export interface AdminOverviewCounts {
  unassigned: number;
  investigationsOpen: number;
  investigationsOverdue: number;
  awaitingVerification: number;
}

/** The numbers on the manager's overview strip. */
export function adminOverview(incidents: Incident[], today: string): AdminOverviewCounts {
  const reports = incidents.filter(isReport);
  return {
    unassigned: reports.filter(needsActionOwner).length,
    investigationsOpen: reports.filter((incident) => incident.assignment?.investigationRequired && incident.assignment.investigationStatus !== "done").length,
    investigationsOverdue: reports.filter((incident) => investigationOverdue(incident, today)).length,
    awaitingVerification: reports.filter((incident) => incident.assignment?.followUpStatus === "pending").length,
  };
}

export type AssignmentResult = "sent" | "no-email" | "skipped" | "failed";

/** The same for a task, a checklist round or an area: the server checks the person really is on that row. */
export async function notifyWork(input: { kind: "task" | "audit" | "area"; id: string; assigneeId: string; language: string }): Promise<AssignmentResult> {
  try {
    const response = await fetch("/api/alerts/work-assigned", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const body = (await response.json().catch(() => null)) as { ok?: boolean; sent?: boolean; reason?: string } | null;
    if (!response.ok || !body) return "failed";
    if (body.sent) return "sent";
    if (body.reason === "no-email") return "no-email";
    if (body.ok) return "skipped";
    return "failed";
  } catch {
    return "failed";
  }
}

/**
 * Asks the server to e-mail a newly assigned action owner. Never throws: saving
 * the assignment must not depend on e-mail delivery. In demo mode (no Supabase)
 * the server skips it.
 */
export async function notifyAssignment(input: {
  incidentId: string;
  assigneeId: string;
  /** What the person is asked to do; decides the wording of the e-mail. Defaults to action owner. */
  role?: "action_owner" | "investigator" | "follow_up" | "follow_up_ready";
  dueDate: string | null;
  note: string | null;
  language: string;
}): Promise<AssignmentResult> {
  try {
    const response = await fetch("/api/alerts/assigned", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const body = (await response.json().catch(() => null)) as { ok?: boolean; sent?: boolean; reason?: string } | null;
    if (!response.ok || !body) return "failed";
    if (body.sent) return "sent";
    if (body.reason === "no-email") return "no-email";
    if (body.ok) return "skipped";
    return "failed";
  } catch {
    return "failed";
  }
}

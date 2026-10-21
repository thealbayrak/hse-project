/** Link a company's QR code opens: the report form limited to that company. */
export function companyReportUrl(organizationId: string, origin: string) {
  return `${origin}/report?org=${encodeURIComponent(organizationId)}`;
}

/** Link a single place's (project's) QR code opens: the report form with that place fixed. */
export function placeReportUrl(siteId: string, origin: string) {
  return `${origin}/report?project_id=${encodeURIComponent(siteId)}`;
}

/** Reads the project id from a report link; accepts the current and the older parameter names. */
export function projectIdFromSearch(params: { get(name: string): string | null }) {
  return params.get("project_id") ?? params.get("project") ?? params.get("site");
}

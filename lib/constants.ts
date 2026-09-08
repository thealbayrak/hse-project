import type {
  IncidentStatus,
  IncidentType,
  RiskCategory,
  Severity,
} from "@/lib/types";

export const APP_NAME = "SiteSafety Nordic";

export const STATUTORY_WARNING =
  "Critical incidents resulting in severe injury or danger must be reported immediately to Arbetsmiljöverket.";

export const INCIDENT_TYPES: {
  id: IncidentType;
  label: string;
  swedish: string;
  hint: string;
}[] = [
  {
    id: "near-miss",
    label: "Near-Miss",
    swedish: "Tillbud",
    hint: "Something almost went wrong",
  },
  {
    id: "hazard",
    label: "Hazard Observation",
    swedish: "Risk",
    hint: "I spotted a danger",
  },
  {
    id: "accident",
    label: "Accident",
    swedish: "Olycka",
    hint: "Someone was hurt",
  },
];

export const RISK_CATEGORIES: {
  id: RiskCategory;
  label: string;
}[] = [
  { id: "falls", label: "Falls from height" },
  { id: "machine", label: "Machine / Equipment" },
  { id: "falling-objects", label: "Falling objects" },
  { id: "slip-trip", label: "Slip / Trip" },
  { id: "chemical", label: "Chemical" },
  { id: "electrical", label: "Electrical" },
  { id: "ergonomic", label: "Ergonomic" },
];

export const SEVERITY_LEVELS: {
  id: Severity;
  label: string;
  hint: string;
}[] = [
  { id: "low", label: "Low", hint: "Unlikely to cause harm" },
  { id: "medium", label: "Medium", hint: "Could cause injury" },
  { id: "high", label: "High", hint: "Likely to cause injury" },
  { id: "critical", label: "Critical", hint: "Severe injury or danger" },
];

export const INCIDENT_STATUSES: {
  id: IncidentStatus;
  label: string;
}[] = [
  { id: "open", label: "Open" },
  { id: "in-progress", label: "In Progress" },
  { id: "resolved", label: "Resolved" },
];

export const SAFETY_OFFICERS = [
  { id: "off-erik", name: "Erik Lindqvist", role: "Safety Officer" },
  { id: "off-anna", name: "Anna Bergström", role: "HSE Manager" },
  { id: "off-johan", name: "Johan Ek", role: "Site Supervisor" },
  { id: "off-maria", name: "Maria Holm", role: "Production Lead" },
] as const;

export const DEFAULT_REPORTER_NAME = "Site worker";

export const VOICE_TRANSCRIPT_SAMPLE =
  "While walking past Factory Line B I noticed the press guard was left open. A pallet of parts was stacked too high next to the walkway, and people were stepping around it. Nobody was hurt, but it looked like something could fall or someone could get caught in the machine.";

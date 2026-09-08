import type { SafetyWalkDomainId } from "@/lib/types";

export interface SkyddsrondChecklistItem {
  key: string;
  title: string;
  prompt: string;
}

export interface SkyddsrondDomain {
  id: SafetyWalkDomainId;
  label: string;
  swedish: string;
  items: SkyddsrondChecklistItem[];
}

export const SKYDDSROND_DOMAINS: SkyddsrondDomain[] = [
  {
    id: "fall-protection",
    label: "Fall Protection",
    swedish: "Fallskydd",
    items: [
      {
        key: "fall-edge-protection",
        title: "Edge protection / guardrails",
        prompt: "Guardrails and toe-boards in place where there is a fall risk.",
      },
      {
        key: "fall-openings",
        title: "Holes and openings covered",
        prompt: "Floor openings, shafts and leading edges are covered or fenced.",
      },
      {
        key: "fall-arrest",
        title: "Fall arrest equipment",
        prompt: "Harnesses, anchors and lanyards used correctly for work at height.",
      },
      {
        key: "fall-access",
        title: "Safe access to height",
        prompt: "Stairs, ramps and designated access routes are stable and used.",
      },
    ],
  },
  {
    id: "order-cleanliness",
    label: "Order & Cleanliness",
    swedish: "Ordning & Reda",
    items: [
      {
        key: "order-walkways",
        title: "Walkways clear",
        prompt: "Pedestrian routes are free of materials, cables and waste.",
      },
      {
        key: "order-housekeeping",
        title: "Workstation housekeeping",
        prompt: "Work areas are tidy; tools and materials stored after use.",
      },
      {
        key: "order-waste",
        title: "Waste and scrap control",
        prompt: "Waste, offcuts and spills are contained in designated areas.",
      },
      {
        key: "order-slip-trip",
        title: "Slip / trip hazards",
        prompt: "Wet floors, ice, debris and uneven surfaces are controlled.",
      },
    ],
  },
  {
    id: "scaffolding-ladders",
    label: "Scaffolding & Ladders",
    swedish: "Ställningar & Stegar",
    items: [
      {
        key: "scaffold-tagged",
        title: "Scaffold inspected and tagged",
        prompt: "Scaffold has a valid inspection tag and is complete.",
      },
      {
        key: "scaffold-platforms",
        title: "Working platforms complete",
        prompt: "Decks, mid-rails and toe-boards are fitted; no gaps.",
      },
      {
        key: "ladders-secured",
        title: "Ladders secured",
        prompt: "Ladders are the right type, footed, tied and used at a safe angle.",
      },
      {
        key: "scaffold-loads",
        title: "Load limits respected",
        prompt: "Materials on platforms stay within marked load limits.",
      },
    ],
  },
  {
    id: "ppe",
    label: "PPE Compliance",
    swedish: "Skyddsutrustning",
    items: [
      {
        key: "ppe-helmet",
        title: "Head protection",
        prompt: "Helmets worn in all designated hard-hat areas.",
      },
      {
        key: "ppe-footwear",
        title: "Safety footwear",
        prompt: "Safety boots worn on site.",
      },
      {
        key: "ppe-hi-vis",
        title: "High-visibility clothing",
        prompt: "Hi-vis worn where vehicles or lifting operations are present.",
      },
      {
        key: "ppe-task",
        title: "Task-specific PPE",
        prompt: "Eye, hearing, respiratory or gloves used as required by the task.",
      },
    ],
  },
  {
    id: "emergency-fire",
    label: "Emergency & Fire",
    swedish: "Brand & Första Hjälpen",
    items: [
      {
        key: "fire-extinguishers",
        title: "Fire extinguishers",
        prompt: "Extinguishers are accessible, signed and within inspection date.",
      },
      {
        key: "fire-exits",
        title: "Escape routes",
        prompt: "Emergency exits and assembly routes are unobstructed.",
      },
      {
        key: "first-aid",
        title: "First aid",
        prompt: "First-aid kits and eyewash are stocked and reachable.",
      },
      {
        key: "emergency-info",
        title: "Emergency information",
        prompt: "Alarm, assembly point and emergency numbers are known on site.",
      },
    ],
  },
];

export const SKYDDSROND_ITEMS = SKYDDSROND_DOMAINS.flatMap((domain) =>
  domain.items.map((item) => ({ ...item, domain: domain.id }))
);

export function skyddsrondTitle(siteName: string, completedAt = new Date()) {
  const date = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(completedAt);
  return `Skyddsrond · ${siteName} · ${date}`;
}

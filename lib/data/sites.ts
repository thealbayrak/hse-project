import type { Site } from "@/lib/types";

export const SITES: Site[] = [
  {
    id: "site-torslanda",
    name: "Volvo Torslanda Plant",
    city: "Gothenburg",
    address: "Torslandavägen, 405 31 Göteborg",
    organizationName: "Volvo Personvagnar AB",
    organizationNumber: "556074-3089",
    locations: [
      { id: "loc-line-b", name: "Factory Line B" },
      { id: "loc-paint", name: "Paint Shop" },
      { id: "loc-loading-a", name: "Loading Bay A" },
      { id: "loc-press", name: "Press Hall" },
    ],
  },
  {
    id: "site-kvillebacken",
    name: "Kvillebäcken Construction Site",
    city: "Gothenburg",
    address: "Kvillebäcksvägen, 417 05 Göteborg",
    organizationName: "Nordic Siteworks AB",
    organizationNumber: "559123-4418",
    locations: [
      { id: "loc-zone-3", name: "Zone 3 Scaffolding" },
      { id: "loc-roof-4", name: "Roof Level 4" },
      { id: "loc-ground", name: "Ground Works" },
      { id: "loc-welfare", name: "Site Cabin / Welfare" },
    ],
  },
  {
    id: "site-malmo",
    name: "Malmö Component Works",
    city: "Malmö",
    address: "Kalkbrottsgatan 12, 212 25 Malmö",
    organizationName: "Sydkomponent AB",
    organizationNumber: "556887-2201",
    locations: [
      { id: "loc-assembly-2", name: "Assembly Cell 2" },
      { id: "loc-chem", name: "Chemical Store" },
      { id: "loc-substation", name: "Electrical Substation" },
      { id: "loc-packing", name: "Packing Hall" },
    ],
  },
];

export function findSite(siteId: string) {
  return SITES.find((site) => site.id === siteId) ?? null;
}

export function findLocation(siteId: string, locationId: string) {
  return findSite(siteId)?.locations.find((location) => location.id === locationId) ?? null;
}

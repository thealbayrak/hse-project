import type { NearbyPlace } from "@/lib/types";

/** Great-circle distance in kilometres. */
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

interface OverpassElement {
  type: string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function kindOf(tags: Record<string, string>): NearbyPlace["kind"] | null {
  if (tags.amenity === "hospital") return "hospital";
  if (tags.amenity === "pharmacy") return "pharmacy";
  if (tags.amenity === "clinic" || tags.amenity === "doctors" || tags.healthcare === "centre") return "clinic";
  return null;
}

function addressOf(tags: Record<string, string>) {
  const parts = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ");
  const city = [tags["addr:postcode"], tags["addr:city"]].filter(Boolean).join(" ");
  return [parts, city].filter(Boolean).join(", ") || null;
}

/** Parses an Overpass JSON reply into sorted places (nearest first, max 3 per kind). */
export function parseOverpass(json: { elements?: OverpassElement[] }, lat: number, lng: number): NearbyPlace[] {
  const places: NearbyPlace[] = [];
  for (const element of json.elements ?? []) {
    const tags = element.tags ?? {};
    const kind = kindOf(tags);
    const pLat = element.lat ?? element.center?.lat;
    const pLng = element.lon ?? element.center?.lon;
    if (!kind || pLat === undefined || pLng === undefined) continue;
    const name = tags.name || tags["name:en"] || tags["name:sv"];
    if (!name) continue;
    places.push({
      name,
      kind,
      latitude: pLat,
      longitude: pLng,
      distanceKm: Math.round(distanceKm(lat, lng, pLat, pLng) * 10) / 10,
      phone: tags.phone || tags["contact:phone"] || null,
      address: addressOf(tags),
    });
  }
  places.sort((a, b) => a.distanceKm - b.distanceKm);
  const counts: Record<string, number> = {};
  return places.filter((place) => {
    counts[place.kind] = (counts[place.kind] ?? 0) + 1;
    return counts[place.kind] <= 3;
  });
}

export function overpassQuery(lat: number, lng: number, radiusMetres: number) {
  return `[out:json][timeout:20];
(
  nwr["amenity"="hospital"](around:${radiusMetres},${lat},${lng});
  nwr["amenity"="pharmacy"](around:${radiusMetres},${lat},${lng});
  nwr["amenity"="clinic"](around:${radiusMetres},${lat},${lng});
);
out center tags;`;
}

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const USER_AGENT = "SiteSafetyNordic/1.0 (+https://hse-project-tau.vercel.app)";
const ATTEMPT_TIMEOUT_MS = 14_000;

/**
 * Queries OpenStreetMap (no API key) for hospitals, clinics and pharmacies
 * around a point. The public Overpass servers are often busy, so each mirror
 * is tried with POST and then GET before moving on.
 */
export async function fetchNearbyPlaces(lat: number, lng: number, radiusMetres = 15_000): Promise<NearbyPlace[]> {
  const query = overpassQuery(lat, lng, radiusMetres);
  const encoded = `data=${encodeURIComponent(query)}`;
  let lastError: unknown = null;
  for (const endpoint of ENDPOINTS) {
    for (const method of ["POST", "GET"] as const) {
      try {
        const response =
          method === "POST"
            ? await fetch(endpoint, {
                method,
                headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT },
                body: encoded,
                signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
              })
            : await fetch(`${endpoint}?${encoded}`, {
                headers: { "User-Agent": USER_AGENT },
                signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
              });
        if (!response.ok) throw new Error(`Overpass ${response.status}`);
        const json = (await response.json()) as { elements?: OverpassElement[] };
        if (!Array.isArray(json.elements)) throw new Error("Overpass: no elements");
        return parseOverpass(json, lat, lng);
      } catch (caught) {
        lastError = caught;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Overpass unavailable");
}

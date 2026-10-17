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

const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

/** Queries OpenStreetMap (no API key) for hospitals, clinics and pharmacies around a point. */
export async function fetchNearbyPlaces(lat: number, lng: number, radiusMetres = 15_000): Promise<NearbyPlace[]> {
  let lastError: unknown = null;
  for (const endpoint of ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(overpassQuery(lat, lng, radiusMetres))}`,
        signal: AbortSignal.timeout(25_000),
      });
      if (!response.ok) throw new Error(`Overpass ${response.status}`);
      return parseOverpass((await response.json()) as { elements?: OverpassElement[] }, lat, lng);
    } catch (caught) {
      lastError = caught;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Overpass unavailable");
}

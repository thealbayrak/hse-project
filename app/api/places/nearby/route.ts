import { NextResponse } from "next/server";
import { fetchNearbyPlaces } from "@/lib/places/overpass";
import type { NearbyPlace } from "@/lib/types";

export const runtime = "nodejs";
// Up to three mirrors × two attempts; the public Overpass servers can be slow.
export const maxDuration = 60;

// Sites rarely move: cache per rounded coordinate for a day.
const cache = new Map<string, { at: number; places: NearbyPlace[] }>();
const TTL_MS = 24 * 60 * 60 * 1000;

/** Nearest hospitals, clinics and pharmacies (OpenStreetMap) for an injury on site. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ ok: false, error: "lat and lng are required." }, { status: 400 });
  }

  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json({ ok: true, places: hit.places, cached: true });
  }

  try {
    const places = await fetchNearbyPlaces(lat, lng);
    cache.set(key, { at: Date.now(), places });
    return NextResponse.json({ ok: true, places });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Lookup failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}

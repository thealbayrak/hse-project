import { describe, expect, it } from "vitest";
import { distanceKm, parseOverpass } from "@/lib/places/overpass";

describe("distanceKm", () => {
  it("measures Stockholm to Uppsala roughly", () => {
    expect(distanceKm(59.3293, 18.0686, 59.8586, 17.6389)).toBeCloseTo(63.5, 0);
  });
});

describe("parseOverpass", () => {
  const here = { lat: 59.33, lng: 18.07 };

  it("keeps named hospitals, clinics and pharmacies sorted by distance, max three per kind", () => {
    const elements: { type: string; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags: Record<string, string> }[] = [
      { type: "node", lat: 59.36, lon: 18.07, tags: { amenity: "hospital", name: "Far hospital" } },
      { type: "way", center: { lat: 59.334, lon: 18.076 }, tags: { amenity: "hospital", name: "Near hospital", phone: "08 123 45 67", "addr:street": "Gatan", "addr:housenumber": "1", "addr:city": "Stockholm" } },
      { type: "node", lat: 59.3305, lon: 18.0705, tags: { amenity: "pharmacy" } }, // no name → dropped
      { type: "node", lat: 59.3305, lon: 18.0705, tags: { amenity: "pharmacy", name: "Apotek 1" } },
      { type: "node", lat: 59.3306, lon: 18.0706, tags: { amenity: "pharmacy", name: "Apotek 2" } },
      { type: "node", lat: 59.3307, lon: 18.0707, tags: { amenity: "pharmacy", name: "Apotek 3" } },
      { type: "node", lat: 59.3308, lon: 18.0708, tags: { amenity: "pharmacy", name: "Apotek 4" } },
      { type: "node", lat: 59.332, lon: 18.072, tags: { healthcare: "centre", name: "Vårdcentral" } },
      { type: "node", lat: 59.332, lon: 18.072, tags: { amenity: "bar", name: "Pub" } },
    ];
    const places = parseOverpass({ elements }, here.lat, here.lng);
    expect(places.filter((p) => p.kind === "pharmacy")).toHaveLength(3);
    expect(places.map((p) => p.name)).not.toContain("Apotek 4");
    expect(places.map((p) => p.name)).not.toContain("Pub");
    expect(places[0].name).toBe("Apotek 1");
    const near = places.find((p) => p.name === "Near hospital")!;
    expect(near).toMatchObject({ kind: "hospital", phone: "08 123 45 67", address: "Gatan 1, Stockholm" });
    expect(places.find((p) => p.name === "Vårdcentral")?.kind).toBe("clinic");
    expect(places.indexOf(places.find((p) => p.name === "Far hospital")!)).toBeGreaterThan(places.indexOf(near));
  });
});

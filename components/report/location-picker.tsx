"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import { LocateFixedIcon, MapPinIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { cn } from "@/lib/utils";

export interface LatLng {
  latitude: number;
  longitude: number;
}

/**
 * OpenStreetMap pin picker (Leaflet, no API key). Centres on the site; the
 * worker taps the exact spot or uses the phone's GPS.
 */
export function LocationPicker({
  center,
  value,
  onChange,
  className,
}: {
  center: LatLng | null;
  value: LatLng | null;
  onChange: (next: LatLng) => void;
  className?: string;
}) {
  const { t } = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const [locating, setLocating] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // Leaflet touches `window`, so it is loaded only in the browser.
  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    import("leaflet").then((L) => {
      if (cancelled || mapRef.current) return;
      const start = value ?? center ?? { latitude: 59.3293, longitude: 18.0686 };
      const map = L.map(container, { zoomControl: true, attributionControl: true }).setView(
        [start.latitude, start.longitude],
        value || center ? 17 : 5
      );
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap",
      }).addTo(map);

      const icon = L.divIcon({
        className: "",
        html: '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:#f59e0b;border:3px solid #0f172a;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 22],
      });

      const place = (point: LatLng) => {
        if (markerRef.current) markerRef.current.setLatLng([point.latitude, point.longitude]);
        else markerRef.current = L.marker([point.latitude, point.longitude], { icon, draggable: true }).addTo(map);
        markerRef.current.off("dragend").on("dragend", () => {
          const pos = markerRef.current!.getLatLng();
          onChangeRef.current({ latitude: pos.lat, longitude: pos.lng });
        });
      };

      if (value) place(value);
      map.on("click", (event) => {
        const point = { latitude: event.latlng.lat, longitude: event.latlng.lng };
        place(point);
        onChangeRef.current(point);
      });

      mapRef.current = map;
      setReady(true);
      // The dialog/accordion may still be animating; size once painted.
      window.setTimeout(() => map.invalidateSize(), 250);
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // The map is created once; later value changes are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !value) return;
    import("leaflet").then((L) => {
      if (markerRef.current) markerRef.current.setLatLng([value.latitude, value.longitude]);
      else {
        const icon = L.divIcon({
          className: "",
          html: '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:#f59e0b;border:3px solid #0f172a;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>',
          iconSize: [22, 22],
          iconAnchor: [11, 22],
        });
        markerRef.current = L.marker([value.latitude, value.longitude], { icon, draggable: true }).addTo(map);
      }
      map.setView([value.latitude, value.longitude], Math.max(map.getZoom(), 17));
    });
  }, [value]);

  function locate() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        onChangeRef.current({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 }
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div
        ref={containerRef}
        role="application"
        aria-label={t("map.title")}
        className="h-64 w-full overflow-hidden rounded-2xl border border-border bg-secondary"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <MapPinIcon className="size-3.5" />
          {value ? `${value.latitude.toFixed(5)}, ${value.longitude.toFixed(5)}` : t("map.tapHint")}
        </span>
        <Button type="button" variant="outline" size="sm" className="h-10 gap-2" onClick={locate} disabled={!ready || locating}>
          <LocateFixedIcon className={cn("size-4", locating && "animate-pulse")} />
          {locating ? t("map.locating") : t("map.useGps")}
        </Button>
      </div>
    </div>
  );
}

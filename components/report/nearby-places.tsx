"use client";

import { useEffect, useState } from "react";
import { HospitalIcon, Loader2Icon, NavigationIcon, PhoneCallIcon, PillIcon, RefreshCwIcon, StethoscopeIcon } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { panelClass } from "@/lib/tones";
import { cn } from "@/lib/utils";
import type { NearbyPlace } from "@/lib/types";

const ICONS = { hospital: HospitalIcon, clinic: StethoscopeIcon, pharmacy: PillIcon } as const;

/** Nearest hospital, clinic and pharmacy for a point (OpenStreetMap). Shown when someone is hurt. */
export function NearbyPlaces({ latitude, longitude }: { latitude: number; longitude: number }) {
  const { t } = useLanguage();
  const [state, setState] = useState<{ status: "loading" } | { status: "done"; places: NearbyPlace[] } | { status: "failed" }>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    fetch(`/api/places/nearby?lat=${latitude.toFixed(4)}&lng=${longitude.toFixed(4)}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((body: { ok?: boolean; places?: NearbyPlace[] }) => {
        if (cancelled) return;
        setState(body.ok && body.places ? { status: "done", places: body.places } : { status: "failed" });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "failed" });
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [latitude, longitude, attempt]);

  return (
    <div className={cn("rounded-2xl border p-4", panelClass.danger)}>
      <p className="font-semibold">{t("places.title")}</p>
      <p className="mt-1 text-sm opacity-85">{t("places.hint")}</p>
      <a
        href="tel:112"
        className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-base font-semibold text-white"
      >
        <PhoneCallIcon className="size-5" />
        {t("places.call112")}
      </a>

      {state.status === "loading" && (
        <p className="mt-3 flex items-center gap-2 text-sm">
          <Loader2Icon className="size-4 animate-spin" />
          {t("places.loading")}
        </p>
      )}
      {state.status === "failed" && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm">{t("places.unavailable")}</p>
          <button
            type="button"
            onClick={() => {
              setState({ status: "loading" });
              setAttempt((value) => value + 1);
            }}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-background/80 px-3 text-sm font-medium"
          >
            <RefreshCwIcon className="size-4" />
            {t("places.retry")}
          </button>
        </div>
      )}
      {state.status === "done" && (
        <ul className="mt-3 space-y-2">
          {state.places.length === 0 && <li className="text-sm">{t("places.none")}</li>}
          {state.places.map((place) => {
            const Icon = ICONS[place.kind];
            return (
              <li key={`${place.kind}-${place.name}-${place.latitude}`} className="flex items-center gap-3 rounded-xl bg-background/60 px-3 py-2">
                <Icon className="size-5 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{place.name}</span>
                  <span className="block truncate text-xs opacity-80">
                    {t(`places.${place.kind}`)} · {t("places.km", { n: place.distanceKm })}
                    {place.address ? ` · ${place.address}` : ""}
                  </span>
                </span>
                {place.phone && (
                  <a href={`tel:${place.phone.replaceAll(/\s/g, "")}`} aria-label={place.phone} className="flex size-10 items-center justify-center rounded-lg bg-background/80">
                    <PhoneCallIcon className="size-4" />
                  </a>
                )}
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${place.latitude},${place.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={t("places.directions")}
                  className="flex size-10 items-center justify-center rounded-lg bg-background/80"
                >
                  <NavigationIcon className="size-4" />
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

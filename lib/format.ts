import { findLocation, findSite } from "@/lib/data/sites";
import { LOCALE_TAGS, translate, type Locale } from "@/lib/i18n/translations";
import type { Incident, IncidentStatus, IncidentType, RiskCategory, Severity } from "@/lib/types";

const TYPE_KEY: Record<IncidentType, string> = {
  "near-miss": "incident.nearMiss",
  hazard: "incident.hazard",
  accident: "incident.accident",
  "good-observation": "incident.goodObservation",
  "positive-observation": "incident.positiveObservation",
  environmental: "incident.environmental",
};

export function typeLabel(type: IncidentType, locale: Locale = "en") {
  return translate(locale, TYPE_KEY[type] ?? "incident.hazard");
}

export function categoryLabel(category: RiskCategory, locale: Locale = "en") {
  return translate(locale, `category.${category}`);
}

/** All risk types of an incident as one label; "not classified" when empty. */
export function categoriesLabel(categories: RiskCategory[], locale: Locale = "en") {
  if (!categories.length) return translate(locale, "category.unclassified");
  return categories.map((category) => categoryLabel(category, locale)).join(", ");
}

export function severityLabel(severity: Severity, locale: Locale = "en") {
  return translate(locale, `severity.${severity}`);
}

export function statusLabel(status: IncidentStatus, locale: Locale = "en") {
  return translate(locale, `status.${status}`);
}

export function siteLabel(siteId: string) {
  return findSite(siteId)?.name ?? siteId;
}

export function locationLabel(siteId: string, locationId: string) {
  return findLocation(siteId, locationId)?.name ?? locationId;
}

export function formatDateTime(iso: string, locale: Locale = "en") {
  return new Intl.DateTimeFormat(LOCALE_TAGS[locale], {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Stockholm",
  }).format(new Date(iso));
}

export function formatDate(iso: string, locale: Locale = "en") {
  return new Intl.DateTimeFormat(LOCALE_TAGS[locale], {
    dateStyle: "medium",
    timeZone: "Europe/Stockholm",
  }).format(new Date(iso));
}

export function relativeTime(iso: string, locale: Locale = "en") {
  const delta = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(delta / 60_000);
  if (minutes < 1) return translate(locale, "time.justNow");
  if (minutes < 60) return translate(locale, "time.minutesAgo", { n: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return translate(locale, "time.hoursAgo", { n: hours });
  const days = Math.round(hours / 24);
  if (days === 1) return translate(locale, "time.yesterday");
  if (days < 14) return translate(locale, "time.daysAgo", { n: days });
  return formatDate(iso, locale);
}

export function placeLabel(incident: Incident) {
  const location = incident.locationName || locationLabel(incident.siteId, incident.locationId);
  const site = incident.siteName || siteLabel(incident.siteId);
  return `${location} · ${site}`;
}

export function csvEscape(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

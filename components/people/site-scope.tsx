"use client";

import { useLanguage } from "@/lib/i18n/LanguageContext";
import type { Role, Site } from "@/lib/types";

/** Managers always see every place of their company; everyone else sees what a manager ticks here. */
export function seesEverything(role: Role) {
  return role === "hse_manager" || role === "admin" || role === "super_admin";
}

/** "Sees all places" plus one checkbox per place; used for one person. */
export function SiteScopeFields({
  sites,
  allSites,
  siteIds,
  onChange,
  idPrefix,
}: {
  sites: Site[];
  allSites: boolean;
  siteIds: string[];
  onChange: (next: { allSites: boolean; siteIds: string[] }) => void;
  idPrefix: string;
}) {
  const { t } = useLanguage();
  return (
    <div className="space-y-2 text-sm">
      <label className="flex min-h-9 items-center gap-2">
        <input
          type="checkbox"
          checked={allSites}
          onChange={(event) => onChange({ allSites: event.target.checked, siteIds })}
          className="size-5 accent-amber-500"
        />
        <span className="font-medium">{t("people.scopeAll")}</span>
      </label>
      {!allSites && (
        <fieldset className="space-y-1 rounded-lg border border-border bg-background/60 p-2">
          <legend className="px-1 text-xs text-muted-foreground">{t("people.scopePick")}</legend>
          {sites.map((site) => (
            <label key={site.id} htmlFor={`${idPrefix}-${site.id}`} className="flex min-h-9 items-center gap-2">
              <input
                id={`${idPrefix}-${site.id}`}
                type="checkbox"
                checked={siteIds.includes(site.id)}
                onChange={(event) =>
                  onChange({ allSites, siteIds: event.target.checked ? [...siteIds, site.id] : siteIds.filter((id) => id !== site.id) })
                }
                className="size-5 accent-amber-500"
              />
              <span>{site.name}</span>
            </label>
          ))}
          {siteIds.length === 0 && <p className="px-1 text-xs text-amber-700 dark:text-amber-300">{t("people.scopeNone")}</p>}
        </fieldset>
      )}
    </div>
  );
}

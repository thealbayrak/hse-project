"use client";

import { useEffect, useState } from "react";
import { CopyIcon, DownloadIcon, PrinterIcon, QrCodeIcon } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/auth/permissions";
import { APP_NAME } from "@/lib/constants";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useIncidentStore } from "@/lib/store/incident-store";
import { panelClass } from "@/lib/tones";
import { cn } from "@/lib/utils";
import type { Site } from "@/lib/types";

function reportUrl(siteId: string) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/report?project=${encodeURIComponent(siteId)}`;
}

/**
 * One QR code per project (site). Scanning it opens the report form with the
 * site fixed, no login, so a worker on that site reports in two taps.
 */
export function ProjectsView() {
  const { t } = useLanguage();
  const { role, sites, profile } = useIncidentStore();
  const allowed = can(role, "projects.manage");
  const [codes, setCodes] = useState<Record<string, string>>({});

  // Super admins see every organisation; everyone else only their own sites.
  const visibleSites =
    role === "super_admin" || !profile?.organizationId ? sites : sites.filter((site) => site.organizationId === profile.organizationId);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      visibleSites.map(async (site) => {
        const svg = await QRCode.toString(reportUrl(site.id), { type: "svg", margin: 1, width: 256, errorCorrectionLevel: "M" });
        return [site.id, svg] as const;
      })
    )
      .then((entries) => {
        if (!cancelled) setCodes(Object.fromEntries(entries));
      })
      .catch(() => {
        if (!cancelled) toast.error(t("projects.qrFailed"));
      });
    return () => {
      cancelled = true;
    };
    // Sites change rarely; their ids are what matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleSites.map((site) => site.id).join(","), t]);

  if (!allowed) {
    return <p className={cn("rounded-xl border px-4 py-3 text-sm", panelClass.warning)}>{t("auth.body")}</p>;
  }

  const organisations = [...new Set(visibleSites.map((site) => site.organizationName ?? "—"))];

  async function copy(site: Site) {
    try {
      await navigator.clipboard.writeText(reportUrl(site.id));
      toast.success(t("projects.copied"));
    } catch {
      toast.error(t("projects.copyFailed"));
    }
  }

  async function download(site: Site) {
    const dataUrl = await QRCode.toDataURL(reportUrl(site.id), { margin: 2, width: 1024, errorCorrectionLevel: "M" });
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `qr-${site.name.replaceAll(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function print(site: Site) {
    const svg = codes[site.id];
    if (!svg) return;
    const frame = document.createElement("iframe");
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${site.name}</title>
      <style>body{font-family:system-ui,sans-serif;text-align:center;padding:40px;color:#0f172a}
      h1{font-size:28px;margin:0 0 4px}p{margin:4px 0;color:#475569}svg{width:70vw;max-width:520px;height:auto;margin:24px auto}
      .url{font-family:monospace;font-size:14px;word-break:break-all}</style></head>
      <body><h1>${site.name}</h1><p>${[site.organizationName, site.city].filter(Boolean).join(" · ")}</p>
      ${svg}<p><strong>${t("projects.printTitle")}</strong></p><p>${t("projects.printHint")}</p>
      <p class="url">${reportUrl(site.id)}</p><p>${APP_NAME}</p></body></html>`);
    doc.close();
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 60_000);
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-[0.16em] text-amber-700 uppercase dark:text-amber-400">{t("roles.officerEyebrow")}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("projects.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("projects.body")}</p>
      </div>

      <div className={cn("rounded-2xl border p-4 text-sm", panelClass.info)}>
        <p className="font-semibold">{t("projects.isolationTitle")}</p>
        <p className="mt-1 opacity-85">{t("projects.isolationBody")}</p>
      </div>

      {organisations.map((organisation) => (
        <section key={organisation} className="space-y-3">
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{organisation}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visibleSites
              .filter((site) => (site.organizationName ?? "—") === organisation)
              .map((site) => (
                <article key={site.id} className="flex flex-col rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-amber-700 dark:text-amber-300">
                      <QrCodeIcon className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-semibold">{site.name}</h3>
                      <p className="text-xs text-muted-foreground">{site.city}</p>
                    </div>
                  </div>
                  <div
                    className="mx-auto my-4 w-full max-w-56 rounded-xl bg-white p-2 [&_svg]:h-auto [&_svg]:w-full"
                    aria-label={t("projects.qrFor", { site: site.name })}
                    // The SVG comes from the qrcode library, not from user input.
                    dangerouslySetInnerHTML={{ __html: codes[site.id] ?? "" }}
                  />
                  <p className="truncate font-mono text-[11px] text-muted-foreground" title={reportUrl(site.id)}>
                    {reportUrl(site.id)}
                  </p>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <Button type="button" variant="outline" size="sm" className="h-11 gap-1" onClick={() => void copy(site)}>
                      <CopyIcon className="size-4" />
                      {t("projects.copy")}
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="h-11 gap-1" onClick={() => void download(site)}>
                      <DownloadIcon className="size-4" />
                      PNG
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="h-11 gap-1" onClick={() => print(site)}>
                      <PrinterIcon className="size-4" />
                      {t("projects.print")}
                    </Button>
                  </div>
                </article>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

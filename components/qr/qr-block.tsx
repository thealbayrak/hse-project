"use client";

import { useEffect, useState } from "react";
import { CopyIcon, DownloadIcon, PrinterIcon } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/constants";
import { useLanguage } from "@/lib/i18n/LanguageContext";

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/** A QR code with copy, PNG download and print. Used for companies and for single places (projects). */
export function QrBlock({ url, title, subtitle, className }: { url: string; title: string; subtitle?: string; className?: string }) {
  const { t } = useLanguage();
  const [svg, setSvg] = useState("");

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(url, { type: "svg", margin: 1, width: 256, errorCorrectionLevel: "M" })
      .then((markup) => {
        if (!cancelled) setSvg(markup);
      })
      .catch(() => {
        if (!cancelled) toast.error(t("projects.qrFailed"));
      });
    return () => {
      cancelled = true;
    };
  }, [url, t]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("projects.copied"));
    } catch {
      toast.error(t("projects.copyFailed"));
    }
  }

  async function download() {
    const dataUrl = await QRCode.toDataURL(url, { margin: 2, width: 1024, errorCorrectionLevel: "M" });
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `qr-${title.replaceAll(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function print() {
    if (!svg) return;
    const frame = document.createElement("iframe");
    Object.assign(frame.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
      <style>body{font-family:system-ui,sans-serif;text-align:center;padding:40px;color:#0f172a}
      h1{font-size:30px;margin:0 0 6px}p{margin:6px 0;color:#475569}svg{width:70vw;max-width:520px;height:auto;margin:24px auto}
      .url{font-family:monospace;font-size:13px;word-break:break-all}</style></head>
      <body><h1>${escapeHtml(title)}</h1>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
      ${svg}<p><strong>${escapeHtml(t("projects.printTitle"))}</strong></p><p>${escapeHtml(t("projects.printHint"))}</p>
      <p class="url">${escapeHtml(url)}</p><p>${APP_NAME}</p></body></html>`);
    doc.close();
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 60_000);
  }

  return (
    <div className={className}>
      <div
        className="mx-auto w-full max-w-52 rounded-xl bg-white p-2 [&_svg]:h-auto [&_svg]:w-full"
        aria-label={t("projects.qrFor", { site: title })}
        // The SVG comes from the qrcode library, not from user input.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <p className="mt-2 truncate text-center font-mono text-[11px] text-muted-foreground" title={url}>
        {url}
      </p>
      <div className="mt-2 grid grid-cols-3 gap-1">
        <Button type="button" variant="outline" size="icon" className="h-10 w-full" aria-label={t("projects.copy")} onClick={() => void copy()}>
          <CopyIcon className="size-4" />
        </Button>
        <Button type="button" variant="outline" size="icon" className="h-10 w-full" aria-label="PNG" onClick={() => void download()}>
          <DownloadIcon className="size-4" />
        </Button>
        <Button type="button" variant="outline" size="icon" className="h-10 w-full" aria-label={t("projects.print")} onClick={print}>
          <PrinterIcon className="size-4" />
        </Button>
      </div>
    </div>
  );
}

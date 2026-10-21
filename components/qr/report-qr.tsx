"use client";

import { useState } from "react";
import { RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { QrBlock } from "@/components/qr/qr-block";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { panelClass } from "@/lib/tones";
import { cn } from "@/lib/utils";

/**
 * The QR code of a company or one place, with a "replace the code" action.
 * Replacing it makes every printed copy of the old code stop working at once,
 * so a photographed or leaked poster cannot be used for spam.
 */
export function ReportQr({
  url,
  title,
  subtitle,
  onRotate,
}: {
  url: string | null;
  title: string;
  subtitle?: string;
  onRotate?: () => Promise<void>;
}) {
  const { t } = useLanguage();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!url) {
    return <p className={cn("rounded-lg border px-3 py-2 text-xs", panelClass.warning)}>{t("qr.noKey")}</p>;
  }

  async function rotate() {
    if (!onRotate) return;
    setBusy(true);
    try {
      await onRotate();
      toast.success(t("qr.rotated"));
      setConfirming(false);
    } catch (caught) {
      toast.error((caught as { message?: string })?.message ?? t("qr.rotateFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <QrBlock url={url} title={title} subtitle={subtitle} />
      {onRotate &&
        (confirming ? (
          <div className={cn("mt-2 rounded-lg border p-2 text-xs", panelClass.warning)}>
            <p>{t("qr.rotateWarning")}</p>
            <div className="mt-2 grid grid-cols-2 gap-1">
              <Button type="button" size="sm" variant="destructive" className="h-9" disabled={busy} onClick={() => void rotate()}>
                {t("qr.rotateConfirm")}
              </Button>
              <Button type="button" size="sm" variant="outline" className="h-9" disabled={busy} onClick={() => setConfirming(false)}>
                {t("buttons.cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" variant="ghost" size="sm" className="mt-1 h-9 w-full gap-1.5 text-muted-foreground" onClick={() => setConfirming(true)}>
            <RefreshCwIcon className="size-3.5" />
            {t("qr.rotate")}
          </Button>
        ))}
    </div>
  );
}

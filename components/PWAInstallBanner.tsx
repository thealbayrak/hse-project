"use client";

import { useEffect, useState } from "react";
import { DownloadIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/i18n/LanguageContext";

const DISMISS_KEY = "sitesafety-pwa-install-dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

function isMobileDevice() {
  return (
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    window.matchMedia("(pointer: coarse) and (max-width: 1024px)").matches
  );
}

function isIosSafari() {
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return iOS && safari;
}

export function PWAInstallBanner() {
  const { t } = useLanguage();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }

    if (isStandalone() || localStorage.getItem(DISMISS_KEY) === "1" || !isMobileDevice()) {
      return;
    }

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);

    if (isIosSafari()) {
      setIosHint(true);
      setVisible(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }

  async function install() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      if (choice.outcome === "accepted") {
        setVisible(false);
        return;
      }
    }

    if (iosHint) {
      toast.message(t("pwa.iosTitle"), {
        description: t("pwa.iosHint"),
      });
    }
  }

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 z-50 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] max-md:bottom-16 md:bottom-3">
      <div className="pointer-events-auto mx-auto flex max-w-lg items-center gap-3 rounded-2xl border border-amber-500/30 bg-slate-950/95 px-3 py-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-md">
        <p className="min-w-0 flex-1 text-[13px] leading-snug text-slate-100">
          {t("pwa.banner")}
        </p>
        <Button className="h-11 shrink-0 gap-1.5 px-3" onClick={() => void install()}>
          <DownloadIcon className="size-4" />
          {t("buttons.installApp")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11 shrink-0 text-slate-300"
          onClick={dismiss}
          aria-label="Dismiss install prompt"
        >
          <XIcon className="size-4" />
        </Button>
      </div>
    </div>
  );
}

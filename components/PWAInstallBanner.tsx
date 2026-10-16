"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
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

function isIosDevice() {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function wasDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

// Device facts do not change while the page is open, so they are read once as
// an external store: false during SSR/hydration, the real value afterwards.
const noopSubscribe = () => () => {};
const serverFalse = () => false;
const readEligible = () => !isStandalone() && isMobileDevice() && !wasDismissed();
const readIos = () => isIosDevice();

export function PWAInstallBanner() {
  const { t } = useLanguage();
  const eligible = useSyncExternalStore(noopSubscribe, readEligible, serverFalse);
  const ios = useSyncExternalStore(noopSubscribe, readIos, serverFalse);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (!eligible) return;
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, [eligible]);

  const iosHint = ios && !deferredPrompt;
  const visible = eligible && !dismissed && !installed && (iosHint || Boolean(deferredPrompt));

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Private mode: the banner simply comes back next visit.
    }
    setDismissed(true);
  }

  async function install() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      if (choice.outcome === "accepted") {
        setInstalled(true);
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
          {iosHint ? t("pwa.iosBanner") : t("pwa.banner")}
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

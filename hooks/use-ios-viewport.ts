"use client";

import { useEffect } from "react";

const KEYBOARD_OPEN_PX = 80;

export function useIosViewport() {
  useEffect(() => {
    const root = document.documentElement;

    function sync() {
      const viewport = window.visualViewport;
      const keyboard = viewport
        ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
        : 0;
      root.style.setProperty("--kb-inset", `${keyboard}px`);
      root.dataset.keyboard = keyboard > KEYBOARD_OPEN_PX ? "open" : "closed";
    }

    sync();
    window.visualViewport?.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("scroll", sync);
    window.addEventListener("orientationchange", sync);
    window.addEventListener("resize", sync);

    return () => {
      window.visualViewport?.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("scroll", sync);
      window.removeEventListener("orientationchange", sync);
      window.removeEventListener("resize", sync);
      delete root.dataset.keyboard;
      root.style.removeProperty("--kb-inset");
    };
  }, []);
}

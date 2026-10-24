"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDownIcon, type LucideIcon } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { cn } from "@/lib/utils";

export interface NavEntry {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** The less used menu entries behind one button, so the top bar stays short. */
export function NavMore({ items, pathname }: { items: NavEntry[]; pathname: string }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const active = items.some((item) => item.href === pathname);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "inline-flex h-11 items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium transition-colors",
          active ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
        )}
      >
        {t("nav.more")}
        <ChevronDownIcon className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul role="menu" className="absolute top-full right-0 z-50 mt-1 w-56 rounded-xl border border-border bg-card p-1.5 shadow-xl">
          {items.map((item) => (
            <li key={item.href} role="none">
              <Link
                role="menuitem"
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn("flex min-h-11 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium hover:bg-secondary/70", item.href === pathname && "bg-secondary")}
              >
                <item.icon className="size-4 text-muted-foreground" />
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CheckIcon, ChevronDownIcon, SearchIcon } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { cn } from "@/lib/utils";

export interface MultiSelectOption<T extends string = string> {
  value: T;
  label: string;
}

/**
 * A filter that takes one button's worth of room: it shows what is picked and
 * opens a list with checkboxes. Replaces rows of chips that filled the screen.
 */
export function MultiSelect<T extends string = string>({
  label,
  options,
  selected,
  onChange,
  className,
  searchAbove = 8,
}: {
  label: string;
  options: MultiSelectOption<T>[];
  selected: T[];
  onChange: (next: T[]) => void;
  className?: string;
  /** A search box appears when there are more options than this. */
  searchAbove?: number;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();

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

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? options.filter((option) => option.label.toLowerCase().includes(needle)) : options;
  }, [options, query]);

  const chosen = options.filter((option) => selected.includes(option.value));
  const summary = chosen.length === 0 ? "" : chosen.length <= 2 ? chosen.map((option) => option.label).join(", ") : `${chosen.length}`;

  function toggle(value: T) {
    onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  }

  return (
    <div ref={root} className={cn("relative", className)}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          setOpen((value) => !value);
          setQuery("");
        }}
        className={cn(
          "flex h-11 max-w-full items-center gap-2 rounded-lg border px-3 text-sm font-medium",
          chosen.length ? "border-amber-500 bg-amber-500/10" : "border-border bg-background"
        )}
      >
        <span className="shrink-0 text-muted-foreground">{label}</span>
        {summary && <span className="min-w-0 truncate font-semibold">{summary}</span>}
        <ChevronDownIcon className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-multiselectable="true"
          aria-label={label}
          className="absolute top-full left-0 z-40 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card p-1.5 shadow-xl"
        >
          {options.length > searchAbove && (
            <div className="relative mb-1">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("filter.search")}
                className="h-10 w-full rounded-lg border border-border bg-background pr-3 pl-8 text-sm"
                autoFocus
              />
            </div>
          )}
          <ul className="max-h-64 overflow-y-auto">
            {shown.map((option) => {
              const active = selected.includes(option.value);
              return (
                <li key={option.value || "__empty"}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => toggle(option.value)}
                    className={cn("flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm hover:bg-secondary/70", active && "font-semibold")}
                  >
                    <span className={cn("flex size-5 shrink-0 items-center justify-center rounded border", active ? "border-amber-500 bg-amber-500 text-slate-950" : "border-border")}>
                      {active && <CheckIcon className="size-3.5" />}
                    </span>
                    <span className="min-w-0 truncate">{option.label}</span>
                  </button>
                </li>
              );
            })}
            {shown.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">{t("filter.none")}</li>}
          </ul>
          {selected.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="mt-1 min-h-10 w-full rounded-lg px-2.5 text-left text-sm font-medium text-muted-foreground hover:bg-secondary/70">
              {t("filter.clear")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

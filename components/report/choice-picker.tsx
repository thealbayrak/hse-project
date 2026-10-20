"use client";

import { useId, useState } from "react";
import { CheckIcon, ChevronDownIcon, PlusIcon, SearchIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PickerOption {
  value: string;
  label: string;
  hint?: string;
}

/**
 * A field that opens a list on tap, with an "add" row for anything that is not
 * in the list. Single choice closes on pick; multiple choice stays open until
 * "Done". Typed entries come back separately as `custom`.
 */
export function ChoicePicker({
  placeholder,
  options,
  selected,
  custom,
  onChange,
  multiple = false,
  allowCustom = true,
  addLabel,
  addPlaceholder,
  doneLabel,
  searchPlaceholder,
  disabled = false,
}: {
  placeholder: string;
  options: PickerOption[];
  selected: string[];
  custom: string[];
  onChange: (selected: string[], custom: string[]) => void;
  multiple?: boolean;
  allowCustom?: boolean;
  addLabel: string;
  addPlaceholder: string;
  doneLabel: string;
  searchPlaceholder?: string;
  disabled?: boolean;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  const chosen = [
    ...options.filter((option) => selected.includes(option.value)).map((option) => ({ key: `o:${option.value}`, label: option.label, custom: false, value: option.value })),
    ...custom.map((text) => ({ key: `c:${text}`, label: text, custom: true, value: text })),
  ];
  const needle = query.trim().toLowerCase();
  const visible = needle ? options.filter((option) => option.label.toLowerCase().includes(needle)) : options;

  function pick(value: string) {
    if (multiple) {
      onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value], custom);
      return;
    }
    onChange([value], []);
    setOpen(false);
    setQuery("");
  }

  function addCustom() {
    const text = draft.trim().slice(0, 120);
    if (!text) return;
    const existing = options.find((option) => option.label.toLowerCase() === text.toLowerCase());
    if (existing) {
      pick(existing.value);
    } else if (multiple) {
      if (!custom.some((item) => item.toLowerCase() === text.toLowerCase())) onChange(selected, [...custom, text]);
    } else {
      onChange([], [text]);
      setOpen(false);
    }
    setDraft("");
    setAdding(false);
  }

  function remove(item: (typeof chosen)[number]) {
    if (item.custom) onChange(selected, custom.filter((text) => text !== item.value));
    else onChange(selected.filter((value) => value !== item.value), custom);
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex min-h-14 w-full items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-left transition-colors",
          open ? "border-amber-500 ring-2 ring-amber-500/30" : "border-border hover:bg-secondary/50",
          disabled && "opacity-60"
        )}
      >
        <span className="min-w-0 flex-1">
          {chosen.length === 0 ? (
            <span className="text-base text-muted-foreground">{placeholder}</span>
          ) : multiple ? (
            <span className="flex flex-wrap gap-1.5">
              {chosen.map((item) => (
                <span key={item.key} className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-sm font-medium text-amber-800 dark:text-amber-200">
                  {item.label}
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`× ${item.label}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      remove(item);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.stopPropagation();
                        remove(item);
                      }
                    }}
                    className="-mr-1 rounded-full p-0.5 hover:bg-amber-500/25"
                  >
                    <XIcon className="size-3.5" />
                  </span>
                </span>
              ))}
            </span>
          ) : (
            <span className="block truncate text-base font-medium">{chosen[0].label}</span>
          )}
        </span>
        <ChevronDownIcon className={cn("size-5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div id={listId} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          {options.length > 6 && (
            <div className="relative border-b border-border">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder ?? placeholder}
                className="h-12 w-full bg-transparent pr-3 pl-9 text-base outline-none"
              />
            </div>
          )}
          <ul role="listbox" aria-multiselectable={multiple} className="max-h-72 overflow-y-auto py-1">
            {visible.map((option) => {
              const active = selected.includes(option.value);
              return (
                <li key={option.value} role="option" aria-selected={active}>
                  <button
                    type="button"
                    onClick={() => pick(option.value)}
                    className={cn("flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-secondary/60", active && "bg-amber-500/10")}
                  >
                    <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-md border", active ? "border-amber-500 bg-amber-500 text-slate-950" : "border-border", !multiple && "rounded-full")}>
                      {active && <CheckIcon className="size-3.5" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-medium">{option.label}</span>
                      {option.hint && <span className="block text-xs text-muted-foreground">{option.hint}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {allowCustom && (
            <div className="border-t border-border p-2">
              {adding ? (
                <div className="flex gap-2">
                  <input
                    autoFocus
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addCustom();
                      }
                    }}
                    placeholder={addPlaceholder}
                    className="h-12 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-base"
                  />
                  <button type="button" onClick={addCustom} disabled={!draft.trim()} className="h-12 shrink-0 rounded-xl bg-amber-500 px-4 text-sm font-semibold text-slate-950 disabled:opacity-50">
                    {addLabel}
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setAdding(true)} className="flex min-h-12 w-full items-center gap-2 rounded-xl px-3 text-left font-medium text-amber-700 hover:bg-amber-500/10 dark:text-amber-300">
                  <PlusIcon className="size-4" />
                  {addLabel}
                </button>
              )}
            </div>
          )}
          {multiple && (
            <div className="border-t border-border p-2">
              <button type="button" onClick={() => setOpen(false)} className="h-11 w-full rounded-xl bg-secondary text-sm font-semibold">
                {doneLabel}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

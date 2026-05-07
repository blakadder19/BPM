"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { ChevronDown, Plus, Search, Check, X } from "lucide-react";

export interface StyleOption {
  id: string;
  name: string;
}

interface StyleComboboxProps {
  /** Currently selected style id (empty string == "no style"). */
  value: string;
  /** All styles available to choose from. */
  styles: StyleOption[];
  /**
   * Called when the user picks a style (existing or newly created).
   * Pass `id=""` and `name=""` for "no style".
   */
  onChange: (id: string, name: string) => void;
  /**
   * When true, the popover offers an inline "Create style: …" affordance
   * for typed values that don't match any existing style. The server
   * action enforces the same permission regardless of this flag.
   */
  canCreate: boolean;
  /**
   * Optional notification hook so the caller can append the new style
   * to its local list and avoid a router refresh.
   */
  onCreated?: (style: StyleOption & { requiresRoleBalance: boolean }) => void;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Searchable style picker with an optional inline-create flow. Keeps a
 * hidden `styleId` input on the parent form via `name` so existing
 * server actions continue to read it without changes.
 */
export function StyleCombobox({
  value,
  styles,
  onChange,
  canCreate,
  onCreated,
  placeholder = "Select or create a style",
  disabled,
}: StyleComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [requiresRoleBalance, setRequiresRoleBalance] = useState(false);
  const [creating, startCreating] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = styles.find((s) => s.id === value) ?? null;

  const normalisedQuery = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!normalisedQuery) return styles;
    return styles.filter((s) =>
      s.name.toLowerCase().includes(normalisedQuery),
    );
  }, [styles, normalisedQuery]);

  const exactMatch = useMemo(
    () =>
      normalisedQuery
        ? styles.find((s) => s.name.trim().toLowerCase() === normalisedQuery)
        : null,
    [styles, normalisedQuery],
  );

  const showCreateOption =
    canCreate && normalisedQuery.length > 0 && !exactMatch && !creating;

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setError(null);
      setRequiresRoleBalance(false);
      // Defer focus so the popover has mounted before we try to focus.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  function pick(style: StyleOption) {
    onChange(style.id, style.name);
    setOpen(false);
  }

  function clear() {
    onChange("", "");
    setOpen(false);
  }

  function handleCreate() {
    const proposed = query.trim();
    if (!proposed) return;
    setError(null);
    startCreating(async () => {
      const { createDanceStyleAction } = await import(
        "@/lib/actions/dance-styles"
      );
      const res = await createDanceStyleAction({
        name: proposed,
        requiresRoleBalance,
      });
      if (!res.success || !res.style) {
        setError(res.error ?? "Failed to create style");
        return;
      }
      const created = res.style;
      onCreated?.({
        id: created.id,
        name: created.name,
        requiresRoleBalance: created.requiresRoleBalance,
      });
      onChange(created.id, created.name);
      setOpen(false);
    });
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="mt-1 flex w-full items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm text-left focus:border-bpm-300 focus:outline-none focus:ring-2 focus:ring-bpm-100 disabled:cursor-not-allowed disabled:bg-gray-50"
      >
        <span className={selected ? "text-gray-900" : "text-gray-400"}>
          {selected ? selected.name : placeholder}
        </span>
        <ChevronDown className="h-4 w-4 text-gray-400" />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b border-gray-100 px-2 py-1.5">
            <Search className="h-4 w-4 text-gray-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search styles…"
              className="w-full bg-transparent text-sm focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && showCreateOption) {
                  e.preventDefault();
                  handleCreate();
                }
              }}
            />
            {selected && (
              <button
                type="button"
                onClick={clear}
                title="Clear selection"
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 && !showCreateOption && (
              <div className="px-3 py-3 text-sm text-gray-400">
                No styles match “{query}”.
              </div>
            )}

            {filtered.map((s) => (
              <button
                type="button"
                key={s.id}
                onClick={() => pick(s)}
                className={`flex w-full items-center justify-between px-3 py-1.5 text-sm hover:bg-bpm-50 ${
                  s.id === value ? "bg-bpm-50" : ""
                }`}
              >
                <span className="text-gray-800">{s.name}</span>
                {s.id === value && (
                  <Check className="h-4 w-4 text-bpm-600" />
                )}
              </button>
            ))}

            {showCreateOption && (
              <div className="border-t border-gray-100 px-3 py-2 space-y-2">
                <p className="text-xs text-gray-500">
                  No match. Create a new style:
                </p>
                <label className="flex items-center gap-2 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={requiresRoleBalance}
                    onChange={(e) => setRequiresRoleBalance(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-bpm-600"
                  />
                  Requires leader/follower role balance
                </label>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={creating}
                  className="flex w-full items-center justify-center gap-1.5 rounded-md bg-bpm-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-bpm-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {creating ? "Creating…" : `Create style: ${query.trim()}`}
                </button>
              </div>
            )}

            {error && (
              <div className="border-t border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

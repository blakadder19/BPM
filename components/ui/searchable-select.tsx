"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { ChevronDown, X } from "lucide-react";

export interface SearchableOption {
  value: string;
  label: string;
  detail?: string;
}

interface SearchableSelectProps {
  options: SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  name?: string;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Select…",
  disabled,
  name,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightIdx, setHighlightIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    if (!query) return options;
    const q = query.toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.detail && o.detail.toLowerCase().includes(q))
    );
  }, [options, query]);

  useEffect(() => {
    setHighlightIdx(0);
  }, [filtered.length]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (open && listRef.current) {
      const el = listRef.current.children[highlightIdx] as HTMLElement | undefined;
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightIdx, open]);

  const handleSelect = useCallback(
    (val: string) => {
      onChange(val);
      setOpen(false);
      setQuery("");
    },
    [onChange]
  );

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightIdx((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (filtered[highlightIdx]) handleSelect(filtered[highlightIdx].value);
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        setQuery("");
        break;
    }
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange("");
    setQuery("");
    inputRef.current?.focus();
  }

  return (
    <div ref={containerRef} className="relative">
      {name && <input type="hidden" name={name} value={value} />}
      <div
        className={`flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-sm ${
          disabled
            ? "border-gray-100 bg-gray-50 text-gray-400"
            : "border-gray-200 text-gray-900 focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100"
        }`}
        onClick={() => {
          if (!disabled) {
            setOpen(true);
            inputRef.current?.focus();
          }
        }}
      >
        <input
          ref={inputRef}
          type="text"
          disabled={disabled}
          className="flex-1 min-w-0 border-0 bg-transparent p-0 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-0"
          placeholder={selected ? selected.label : placeholder}
          value={open ? query : selected ? selected.label : ""}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            if (!open) setOpen(true);
            if (selected) setQuery("");
          }}
          onKeyDown={handleKeyDown}
        />
        {value && !disabled ? (
          <button
            type="button"
            onClick={handleClear}
            className="rounded p-0.5 text-gray-400 hover:text-gray-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-400" />
        )}
      </div>

      {open && filtered.length > 0 && (
        <ul
          ref={listRef}
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          {filtered.map((opt, i) => (
            <li
              key={opt.value}
              className={`cursor-pointer px-3 py-2 text-sm ${
                i === highlightIdx ? "bg-indigo-50 text-indigo-700" : "text-gray-700 hover:bg-gray-50"
              } ${opt.value === value ? "font-medium" : ""}`}
              onMouseEnter={() => setHighlightIdx(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(opt.value);
              }}
            >
              <div className="truncate">{opt.label}</div>
              {opt.detail && (
                <div className="truncate text-xs text-gray-400">{opt.detail}</div>
              )}
            </li>
          ))}
        </ul>
      )}

      {open && filtered.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-3 text-sm text-gray-400 shadow-lg">
          No results found
        </div>
      )}
    </div>
  );
}

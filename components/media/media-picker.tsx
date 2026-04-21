"use client";

import { useState, useRef, useTransition, useEffect, useCallback } from "react";
import {
  Upload,
  X,
  Loader2,
  ImageIcon,
  Trash2,
  Check,
  Link as LinkIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  uploadMediaAction,
  listMediaAction,
  deleteMediaAction,
} from "@/lib/actions/admin-media";
import type { MediaItem } from "@/lib/domain/media-types";

interface MediaPickerProps {
  kind?: string;
  value: string | null;
  onChange: (url: string | null) => void;
  /** Allow pasting an external URL as fallback */
  allowExternalUrl?: boolean;
}

type Tab = "library" | "upload" | "url";

/**
 * Reusable admin image picker.
 * Supports selecting from the media library, uploading a new image,
 * and optionally pasting an external URL.
 */
export function MediaPicker({
  kind = "general",
  value,
  onChange,
  allowExternalUrl = true,
}: MediaPickerProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("library");
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, startUpload] = useTransition();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [externalUrl, setExternalUrl] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  useEffect(() => {
    if (open) loadLibrary();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadLibrary() {
    setLoading(true);
    try {
      const result = await listMediaAction(kind);
      setItems(result);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  function handleUpload(file: File) {
    setError(null);
    startUpload(async () => {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("kind", kind);
      const res = await uploadMediaAction(fd);
      if (!res.success) {
        setError(res.error ?? "Upload failed.");
        return;
      }
      if (res.item) {
        setItems((prev) => [res.item!, ...prev]);
        onChange(res.item.publicUrl);
        setOpen(false);
      }
    });
  }

  const ACCEPTED_TYPES = new Set([
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
  ]);

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setDragOver(false);
    }
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (!file) return;
      if (!ACCEPTED_TYPES.has(file.type)) {
        setError("Unsupported file type. Use JPG, PNG, WebP, or GIF.");
        return;
      }
      handleUpload(file);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind],
  );

  async function handleDelete(item: MediaItem) {
    setDeleting(item.id);
    try {
      const res = await deleteMediaAction(item.id);
      if (res.success) {
        setItems((prev) => prev.filter((m) => m.id !== item.id));
        if (value === item.publicUrl) onChange(null);
      } else {
        setError(res.error ?? "Delete failed.");
      }
    } finally {
      setDeleting(null);
    }
  }

  if (!open) {
    return (
      <div className="space-y-2">
        {value && (
          <div className="relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt=""
              className="h-20 w-32 rounded-lg border border-gray-200 object-cover"
            />
            <button
              type="button"
              onClick={() => onChange(null)}
              className="absolute -right-1.5 -top-1.5 rounded-full bg-white border border-gray-200 p-0.5 text-gray-400 hover:text-red-500 shadow-sm"
              title="Remove image"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs font-medium text-gray-500 hover:border-bpm-400 hover:text-bpm-600 transition-colors"
        >
          <ImageIcon className="h-3.5 w-3.5" />
          {value ? "Change image" : "Select or upload image"}
        </button>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "library", label: "Library" },
    { id: "upload", label: "Upload" },
    ...(allowExternalUrl ? [{ id: "url" as Tab, label: "URL" }] : []),
  ];

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { setTab(t.id); setError(null); }}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                tab === t.id
                  ? "bg-bpm-50 text-bpm-700"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded p-1 text-gray-400 hover:text-gray-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {error && (
        <div className="mx-3 mt-2 rounded bg-red-50 px-2 py-1.5 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="p-3">
        {tab === "library" && (
          <div>
            {loading ? (
              <div className="flex items-center justify-center py-8 text-gray-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <div className="py-6 text-center text-xs text-gray-400">
                No images yet. Upload one to get started.
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                {items.map((item) => {
                  const isSelected = value === item.publicUrl;
                  return (
                    <div
                      key={item.id}
                      className={`group relative cursor-pointer rounded-lg border-2 overflow-hidden transition-colors ${
                        isSelected ? "border-bpm-500" : "border-transparent hover:border-gray-300"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.publicUrl}
                        alt={item.altText || ""}
                        className="h-20 w-full object-cover"
                        onClick={() => {
                          onChange(item.publicUrl);
                          setOpen(false);
                        }}
                      />
                      {isSelected && (
                        <div className="absolute inset-0 flex items-center justify-center bg-bpm-600/20">
                          <Check className="h-5 w-5 text-white drop-shadow" />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(item);
                        }}
                        disabled={deleting === item.id}
                        className="absolute right-1 top-1 rounded bg-white/80 p-0.5 text-gray-400 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity"
                        title="Delete"
                      >
                        {deleting === item.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === "upload" && (
          <div className="space-y-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              onDragEnter={onDragEnter}
              onDragLeave={onDragLeave}
              onDragOver={onDragOver}
              onDrop={onDrop}
              className={`flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 transition-colors disabled:opacity-50 ${
                dragOver
                  ? "border-bpm-500 bg-bpm-50 text-bpm-600"
                  : "border-gray-300 text-gray-400 hover:border-bpm-400 hover:text-bpm-500"
              }`}
            >
              {uploading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <Upload className="h-6 w-6" />
              )}
              <span className="text-xs font-medium">
                {uploading
                  ? "Uploading..."
                  : dragOver
                    ? "Drop to upload"
                    : "Drag and drop an image here, or click to upload"}
              </span>
              <span className="text-[10px]">JPG, PNG, WebP, GIF — max 5 MB</span>
            </button>
          </div>
        )}

        {tab === "url" && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <LinkIcon className="h-3.5 w-3.5" />
              Paste an external image URL
            </div>
            <input
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              placeholder="https://example.com/image.jpg"
              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-bpm-500 focus:outline-none focus:ring-2 focus:ring-bpm-100"
            />
            <Button
              size="sm"
              disabled={!externalUrl.trim()}
              onClick={() => {
                onChange(externalUrl.trim());
                setOpen(false);
              }}
            >
              Use this URL
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

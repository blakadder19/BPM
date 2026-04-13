"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ListChecks, CalendarRange } from "lucide-react";
import type { MockClass } from "@/lib/mock-data";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface PreviewItem {
  templateId: string;
  title: string;
  classType: string;
  styleName: string | null;
  level: string | null;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  isDuplicate: boolean;
}

interface BulkCreateDialogProps {
  templates: MockClass[];
  allTerms?: { id: string; name: string; startDate: string; endDate: string }[];
  existingKeys: Set<string>;
  onClose: () => void;
}

export function BulkCreateDialog({
  templates,
  allTerms,
  existingKeys,
  onClose,
}: BulkCreateDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    created: number;
    skipped: number;
    failed: number;
  } | null>(null);

  const activeTemplates = useMemo(
    () => templates.filter((t) => t.isActive),
    [templates]
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [templateSearch, setTemplateSearch] = useState("");

  const [selectedTermId, setSelectedTermId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [initialStatus, setInitialStatus] = useState<"scheduled" | "open">(
    "scheduled"
  );

  const [showPreview, setShowPreview] = useState(false);

  function handleTermSelect(termId: string) {
    setSelectedTermId(termId);
    if (termId) {
      const term = allTerms?.find((t) => t.id === termId);
      if (term) {
        setStartDate(term.startDate);
        setEndDate(term.endDate);
      }
    }
    setShowPreview(false);
  }

  function toggleTemplate(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setShowPreview(false);
  }

  const filteredTemplates = useMemo(() => {
    const q = templateSearch.toLowerCase();
    if (!q) return activeTemplates;
    return activeTemplates.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.styleName?.toLowerCase().includes(q) ||
        t.level?.toLowerCase().includes(q)
    );
  }, [activeTemplates, templateSearch]);

  function toggleAll() {
    if (selectedIds.size === filteredTemplates.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredTemplates.map((t) => t.id)));
    }
    setShowPreview(false);
  }

  const previewItems = useMemo(() => {
    if (!showPreview || !startDate || !endDate || selectedIds.size === 0)
      return [];

    const items: PreviewItem[] = [];
    const selected = activeTemplates.filter((t) => selectedIds.has(t.id));
    const start = new Date(startDate + "T12:00:00");
    const end = new Date(endDate + "T12:00:00");

    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const jsDay = d.getDay();
      const dateStr = d.toISOString().slice(0, 10);

      for (const tpl of selected) {
        if (tpl.dayOfWeek !== jsDay) continue;

        const key = `${tpl.id}|${dateStr}|${tpl.startTime}`;
        items.push({
          templateId: tpl.id,
          title: tpl.title,
          classType: tpl.classType,
          styleName: tpl.styleName,
          level: tpl.level,
          date: dateStr,
          startTime: tpl.startTime,
          endTime: tpl.endTime,
          location: tpl.location,
          isDuplicate: existingKeys.has(key),
        });
      }
    }

    return items.sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)
    );
  }, [showPreview, startDate, endDate, selectedIds, activeTemplates, existingKeys]);

  const newItems = previewItems.filter((p) => !p.isDuplicate);
  const duplicateCount = previewItems.length - newItems.length;

  const canPreview =
    selectedIds.size > 0 && startDate && endDate && endDate >= startDate;
  const canCreate = showPreview && newItems.length > 0;

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      const { bulkCreateInstancesAction } = await import(
        "@/lib/actions/classes"
      );
      const res = await bulkCreateInstancesAction(
        Array.from(selectedIds),
        startDate,
        endDate,
        initialStatus
      );
      if (res.success) {
        setResult({
          created: res.created,
          skipped: res.skipped,
          failed: res.failed,
        });
        router.refresh();
      } else {
        setError(res.error ?? "Failed to create instances");
        if (res.created > 0) router.refresh();
      }
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListChecks className="h-5 w-5" />
            Bulk Create Instances
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          {result ? (
            <div className="space-y-3">
              <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
                Created <strong>{result.created}</strong> instance
                {result.created !== 1 ? "s" : ""}
                {result.skipped > 0 && (
                  <>
                    , skipped {result.skipped} duplicate
                    {result.skipped !== 1 ? "s" : ""}
                  </>
                )}
                {result.failed > 0 && (
                  <>
                    ,{" "}
                    <span className="text-red-600">
                      {result.failed} failed
                    </span>
                  </>
                )}
                .
              </div>
              <div className="flex justify-end">
                <Button onClick={onClose}>Done</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {error && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* ── 1. Template selection ────────────────── */}
              <fieldset className="space-y-2 rounded-lg border border-gray-200 p-3">
                <legend className="px-1 text-xs font-semibold text-gray-500">
                  1. Select Templates ({selectedIds.size} selected)
                </legend>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Search templates…"
                    value={templateSearch}
                    onChange={(e) => setTemplateSearch(e.target.value)}
                    className="flex-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:border-bpm-300 focus:outline-none focus:ring-2 focus:ring-bpm-100"
                  />
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="whitespace-nowrap rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                  >
                    {selectedIds.size === filteredTemplates.length &&
                    filteredTemplates.length > 0
                      ? "Deselect All"
                      : "Select All"}
                  </button>
                </div>

                <div className="max-h-48 overflow-y-auto rounded border border-gray-100 bg-gray-50/50">
                  {filteredTemplates.length === 0 ? (
                    <p className="px-3 py-2 text-sm italic text-gray-400">
                      No active templates found.
                    </p>
                  ) : (
                    filteredTemplates.map((tpl) => (
                      <label
                        key={tpl.id}
                        className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 transition-colors hover:bg-gray-100/80"
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(tpl.id)}
                          onChange={() => toggleTemplate(tpl.id)}
                          className="h-3.5 w-3.5 rounded border-gray-300 text-bpm-600"
                        />
                        <span className="flex-1 text-sm">
                          {tpl.title}
                          {tpl.styleName && (
                            <span className="ml-1.5 text-xs text-gray-400">
                              · {tpl.styleName}
                            </span>
                          )}
                          {tpl.level && (
                            <span className="ml-1 text-xs text-gray-400">
                              · {tpl.level}
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-gray-400">
                          {DAY_LABELS[tpl.dayOfWeek]} {tpl.startTime}–
                          {tpl.endTime}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </fieldset>

              {/* ── 2. Date range ────────────────────────── */}
              <fieldset className="space-y-3 rounded-lg border border-gray-200 p-3">
                <legend className="px-1 text-xs font-semibold text-gray-500">
                  2. Date Range
                </legend>

                {allTerms && allTerms.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Quick: Select Term
                    </label>
                    <select
                      value={selectedTermId}
                      onChange={(e) => handleTermSelect(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-bpm-300 focus:outline-none focus:ring-2 focus:ring-bpm-100"
                    >
                      <option value="">— Choose a term —</option>
                      {allTerms.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.startDate} → {t.endDate})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Start Date *
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        setShowPreview(false);
                      }}
                      className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-bpm-300 focus:outline-none focus:ring-2 focus:ring-bpm-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      End Date *
                    </label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => {
                        setEndDate(e.target.value);
                        setShowPreview(false);
                      }}
                      className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-bpm-300 focus:outline-none focus:ring-2 focus:ring-bpm-100"
                    />
                  </div>
                </div>
              </fieldset>

              {/* ── 3. Status ─────────────────────────────── */}
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700">
                  Initial Status:
                </label>
                <select
                  value={initialStatus}
                  onChange={(e) =>
                    setInitialStatus(e.target.value as "scheduled" | "open")
                  }
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-bpm-300 focus:outline-none focus:ring-2 focus:ring-bpm-100"
                >
                  <option value="scheduled">Scheduled</option>
                  <option value="open">Open</option>
                </select>
              </div>

              {/* ── Preview / Actions ─────────────────────── */}
              {!showPreview ? (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-400">
                    Instances are generated for each template's weekday within
                    the date range.
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={onClose}>
                      Cancel
                    </Button>
                    <Button
                      onClick={() => setShowPreview(true)}
                      disabled={!canPreview}
                    >
                      <CalendarRange className="mr-1.5 h-4 w-4" />
                      Preview
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-gray-700">
                        {newItems.length} instance
                        {newItems.length !== 1 ? "s" : ""} to create
                      </span>
                      {duplicateCount > 0 && (
                        <Badge variant="warning">
                          {duplicateCount} duplicate
                          {duplicateCount !== 1 ? "s" : ""} skipped
                        </Badge>
                      )}
                    </div>

                    {previewItems.length > 0 && (
                      <div className="max-h-60 overflow-y-auto rounded-lg border border-gray-200">
                        <table className="min-w-full text-sm">
                          <thead className="sticky top-0 bg-gray-50 text-xs text-gray-500">
                            <tr>
                              <th className="px-3 py-1.5 text-left font-medium">
                                Date
                              </th>
                              <th className="px-3 py-1.5 text-left font-medium">
                                Title
                              </th>
                              <th className="px-3 py-1.5 text-left font-medium">
                                Time
                              </th>
                              <th className="px-3 py-1.5 text-left font-medium">
                                Style / Level
                              </th>
                              <th className="px-3 py-1.5 text-left font-medium" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {previewItems.map((item, idx) => (
                              <tr
                                key={`${item.templateId}-${item.date}-${idx}`}
                                className={
                                  item.isDuplicate
                                    ? "bg-amber-50/50 text-gray-400 line-through"
                                    : ""
                                }
                              >
                                <td className="whitespace-nowrap px-3 py-1.5">
                                  {item.date}
                                </td>
                                <td className="px-3 py-1.5">{item.title}</td>
                                <td className="whitespace-nowrap px-3 py-1.5">
                                  {item.startTime}–{item.endTime}
                                </td>
                                <td className="px-3 py-1.5 text-xs text-gray-500">
                                  {[item.styleName, item.level]
                                    .filter(Boolean)
                                    .join(" · ") || "—"}
                                </td>
                                <td className="px-3 py-1.5">
                                  {item.isDuplicate ? (
                                    <span className="text-xs text-amber-600">
                                      Exists
                                    </span>
                                  ) : (
                                    <span className="text-xs text-green-600">
                                      New
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {newItems.length === 0 && previewItems.length > 0 && (
                      <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
                        All instances already exist. Nothing new to create.
                      </div>
                    )}
                    {previewItems.length === 0 && (
                      <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
                        No matching dates found for the selected templates in
                        this range. Check that the templates' weekdays fall
                        within the range.
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>
                      Cancel
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowPreview(false)}
                    >
                      ← Back
                    </Button>
                    <Button
                      onClick={handleCreate}
                      disabled={!canCreate || isPending}
                    >
                      {isPending
                        ? "Creating…"
                        : `Create ${newItems.length} Instance${newItems.length !== 1 ? "s" : ""}`}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

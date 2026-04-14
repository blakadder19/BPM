"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { sendEventAnnouncementAction, type AnnouncementResult } from "@/lib/actions/event-announcements";
import type { MockSpecialEvent } from "@/lib/mock-data";

interface Props {
  open: boolean;
  onClose: () => void;
  event: MockSpecialEvent;
  students: { id: string; fullName: string }[];
}

const inputCls =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-bpm-500 focus:outline-none focus:ring-1 focus:ring-bpm-500";
const checkCls =
  "h-4 w-4 rounded border-gray-300 text-bpm-600 focus:ring-bpm-500";

export function EventAnnouncementDialog({ open, onClose, event, students }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnnouncementResult | null>(null);

  const [recipientMode, setRecipientMode] = useState<"all_students" | "selected_students" | "external_only">("all_students");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [externalEmails, setExternalEmails] = useState("");
  const [sendInApp, setSendInApp] = useState(true);
  const [sendEmail, setSendEmail] = useState(true);

  function toggleStudent(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleSend() {
    setError(null);
    setResult(null);
    if (!sendInApp && !sendEmail) {
      setError("Select at least one channel (in-app or email).");
      return;
    }

    const externals = externalEmails
      .split(/[,\n]+/)
      .map((e) => e.trim())
      .filter(Boolean);

    startTransition(async () => {
      const res = await sendEventAnnouncementAction({
        eventId: event.id,
        recipientMode,
        selectedStudentIds:
          recipientMode === "selected_students" ? Array.from(selectedIds) : undefined,
        externalEmails: externals.length > 0 ? externals : undefined,
        sendInApp,
        sendEmail,
      });
      if (res.success) {
        setResult(res);
      } else {
        setError(res.error ?? "Something went wrong");
      }
    });
  }

  function handleClose() {
    setError(null);
    setResult(null);
    onClose();
  }

  return (
    <Dialog open={open} onClose={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Promote Event</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-sm font-medium text-gray-900">{event.title}</p>
            {event.subtitle && (
              <p className="text-xs text-gray-500 mt-0.5">{event.subtitle}</p>
            )}
          </div>

          {/* Recipients */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Internal recipients
            </label>
            <select
              value={recipientMode}
              onChange={(e) =>
                setRecipientMode(
                  e.target.value as "all_students" | "selected_students" | "external_only",
                )
              }
              className={inputCls}
            >
              <option value="all_students">All students</option>
              <option value="selected_students">Selected students</option>
              <option value="external_only">External only (no internal)</option>
            </select>
          </div>

          {recipientMode === "selected_students" && (
            <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200 p-3 space-y-1">
              {students.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(s.id)}
                    onChange={() => toggleStudent(s.id)}
                    className={checkCls}
                  />
                  {s.fullName}
                </label>
              ))}
              {students.length === 0 && (
                <p className="text-xs text-gray-400">No students available.</p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              External email recipients (optional)
            </label>
            <textarea
              value={externalEmails}
              onChange={(e) => setExternalEmails(e.target.value)}
              placeholder="Enter email addresses, separated by commas or new lines"
              rows={3}
              className={inputCls}
            />
          </div>

          {/* Channels */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Channels
            </label>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={sendInApp}
                  onChange={(e) => setSendInApp(e.target.checked)}
                  className={checkCls}
                />
                In-app notification (bell)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={sendEmail}
                  onChange={(e) => setSendEmail(e.target.checked)}
                  className={checkCls}
                />
                Email
              </label>
            </div>
            <p className="mt-1 text-xs text-gray-400">
              External recipients only receive email, never in-app notifications.
            </p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {result && (
            <div className="space-y-2">
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 space-y-1">
                <p className="text-sm font-medium text-green-700">Announcement sent</p>
                <div className="text-xs text-green-600 space-y-0.5">
                  {(result.inAppCount ?? 0) > 0 && <p>{result.inAppCount} in-app notification(s) delivered</p>}
                  {(result.emailCount ?? 0) > 0 && <p>{result.emailCount} email(s) sent</p>}
                  {(result.inAppCount ?? 0) === 0 && (result.emailCount ?? 0) === 0 && (
                    <p>No notifications were delivered.</p>
                  )}
                </div>
              </div>
              {result.warnings && result.warnings.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  {result.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-amber-700">{w}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            {result ? "Done" : "Cancel"}
          </button>
          {!result && (
            <button
              type="button"
              disabled={isPending}
              onClick={handleSend}
              className="rounded-lg bg-bpm-600 px-4 py-2 text-sm font-medium text-white hover:bg-bpm-700 disabled:opacity-50"
            >
              {isPending ? "Sending…" : "Send announcement"}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

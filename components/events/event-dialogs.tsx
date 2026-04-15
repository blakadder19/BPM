"use client";

import { useState, useRef, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Upload, X, CalendarDays, MapPin, AlertTriangle, Clock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import type { MockSpecialEvent, MockEventSession, MockEventProduct } from "@/lib/mock-data";

// ── Helpers ──────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-bpm-500 focus:outline-none focus:ring-1 focus:ring-bpm-500";
const selectCls = inputCls;
const checkCls = "h-4 w-4 rounded border-gray-300 text-bpm-600 focus:ring-bpm-500";

// ══════════════════════════════════════════════════════════════
// EVENT FORM DIALOG
// ══════════════════════════════════════════════════════════════

const ACCEPTED_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const ACCEPTED_IMAGE_TYPES = ".jpg,.jpeg,.png,.webp";
const MAX_FILE_SIZE = 5 * 1024 * 1024;

import { formatEventDateRange, eventDateOnly, eventTimeOnly, isOvernightSession } from "@/lib/utils";

export function EventFormDialog({
  open,
  onClose,
  defaults,
  action,
}: {
  open: boolean;
  onClose: () => void;
  defaults?: MockSpecialEvent;
  action: (fd: FormData) => Promise<{ success: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isEdit = !!defaults;

  const fileRef = useRef<HTMLInputElement>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(defaults?.coverImageUrl ?? null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [ratioWarning, setRatioWarning] = useState<string | null>(null);

  const [liveTitle, setLiveTitle] = useState(defaults?.title ?? "");
  const [liveSubtitle, setLiveSubtitle] = useState(defaults?.subtitle ?? "");
  const [liveLocation, setLiveLocation] = useState(defaults?.location ?? "");
  const [liveStart, setLiveStart] = useState(defaults?.startDate?.slice(0, 16) ?? "");
  const [liveEnd, setLiveEnd] = useState(defaults?.endDate?.slice(0, 16) ?? "");

  function checkRatio(src: string) {
    const img = new Image();
    img.onload = () => {
      const ratio = img.width / img.height;
      const ideal = 4 / 5; // 0.8
      const deviation = Math.abs(ratio - ideal) / ideal;
      if (deviation > 0.15) {
        const actual = `${img.width} × ${img.height}`;
        setRatioWarning(
          ratio > 1
            ? `This image is landscape (${actual}). For best results, use a vertical 4:5 poster (1080 × 1350 px).`
            : `This image ratio (${actual}) differs from the recommended 4:5 vertical. Ideal size: 1080 × 1350 px.`,
        );
      } else {
        setRatioWarning(null);
      }
    };
    img.src = src;
  }

  function acceptFile(file: File) {
    if (!ACCEPTED_MIME.has(file.type)) {
      setError("Unsupported file type. Use JPG, PNG, or WebP.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("Image must be smaller than 5 MB.");
      return;
    }
    setError(null);
    setRatioWarning(null);
    const objectUrl = URL.createObjectURL(file);
    setSelectedFile(file);
    setPreviewSrc(objectUrl);
    setRemoveImage(false);
    checkRatio(objectUrl);
  }

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) acceptFile(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) acceptFile(file);
  }

  function clearImage() {
    setSelectedFile(null);
    setPreviewSrc(null);
    setRemoveImage(true);
    setRatioWarning(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    if (selectedFile) fd.set("coverImageFile", selectedFile);
    if (removeImage) fd.set("removeCoverImage", "true");
    startTransition(async () => {
      const res = await action(fd);
      if (res.success) { router.refresh(); onClose(); }
      else setError(res.error ?? "Something went wrong");
    });
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader><DialogTitle>{isEdit ? "Edit Event" : "Create Event"}</DialogTitle></DialogHeader>
          <DialogBody className="space-y-4">
            {isEdit && <input type="hidden" name="id" value={defaults.id} />}

            <Field label="Title">
              <input name="title" defaultValue={defaults?.title ?? ""} required className={inputCls} onChange={(e) => setLiveTitle(e.target.value)} />
            </Field>
            <Field label="Subtitle">
              <input name="subtitle" defaultValue={defaults?.subtitle ?? ""} className={inputCls} onChange={(e) => setLiveSubtitle(e.target.value)} />
            </Field>
            <Field label="Description">
              <textarea name="description" rows={3} defaultValue={defaults?.description ?? ""} className={inputCls} />
            </Field>
            <Field label="Location">
              <input name="location" defaultValue={defaults?.location ?? ""} className={inputCls} onChange={(e) => setLiveLocation(e.target.value)} />
            </Field>

            {/* Cover image upload with drag & drop */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Event poster</label>
              <p className="text-xs text-gray-400 mb-2">Recommended: 4:5 vertical poster · 1080 × 1350 px · Same artwork you&rsquo;d use on Instagram</p>
              {previewSrc ? (
                <div className="relative rounded-lg border border-gray-200 overflow-hidden bg-gray-50 flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewSrc}
                    alt="Cover preview"
                    className="w-full max-w-[240px] h-auto block"
                    onError={() => setPreviewSrc(null)}
                  />
                  <div className="absolute top-2 right-2 flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="rounded-md bg-white/90 px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-white"
                    >
                      Replace
                    </button>
                    <button
                      type="button"
                      onClick={clearImage}
                      className="rounded-md bg-white/90 p-1 text-gray-500 shadow-sm hover:bg-white hover:text-red-600"
                      title="Remove image"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {selectedFile && (
                    <div className="absolute bottom-0 inset-x-0 bg-black/50 px-3 py-1.5 text-center">
                      <p className="text-xs text-white truncate">{selectedFile.name} — will be uploaded on save</p>
                    </div>
                  )}
                </div>
              ) : (
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                  onClick={() => fileRef.current?.click()}
                  className={`flex w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed py-8 text-sm transition-colors ${
                    dragOver
                      ? "border-bpm-500 bg-bpm-50 text-bpm-600"
                      : "border-gray-300 text-gray-500 hover:border-bpm-400 hover:text-bpm-600"
                  }`}
                >
                  <Upload className="h-5 w-5" />
                  <span className="font-medium">{dragOver ? "Drop image here" : "Upload event poster"}</span>
                  <span className="text-xs text-gray-400">Drag & drop or click · JPG, PNG, WebP · Max 5 MB</span>
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPTED_IMAGE_TYPES}
                onChange={onFileSelected}
                className="hidden"
              />

              {ratioWarning && (
                <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">{ratioWarning}</p>
                </div>
              )}

              {!previewSrc && !selectedFile && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-600">
                    Or paste an image URL
                  </summary>
                  <input
                    name="coverImageUrl"
                    defaultValue={defaults?.coverImageUrl ?? ""}
                    className={`${inputCls} mt-1`}
                    placeholder="https://..."
                  />
                </details>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Start">
                <input type="datetime-local" name="startDate" defaultValue={defaults?.startDate?.slice(0, 16) ?? ""} required className={inputCls} onChange={(e) => setLiveStart(e.target.value)} />
              </Field>
              <Field label="End">
                <input type="datetime-local" name="endDate" defaultValue={defaults?.endDate?.slice(0, 16) ?? ""} required className={inputCls} min={liveStart || undefined} onChange={(e) => setLiveEnd(e.target.value)} />
              </Field>
            </div>
            {liveStart && liveEnd && new Date(liveEnd) <= new Date(liveStart) && (
              <p className="text-xs text-red-600 -mt-2">End must be after start</p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Status">
                <select name="status" defaultValue={defaults?.status ?? "draft"} className={selectCls}>
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
              </Field>
              <Field label="Overall event capacity">
                <input type="number" name="overallCapacity" min={0} defaultValue={defaults?.overallCapacity ?? ""} className={inputCls} placeholder="No limit" />
                <p className="mt-0.5 text-xs text-gray-400">Total tickets for the whole event. Leave empty for no global limit. Session capacities are separate.</p>
              </Field>
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="isVisible" defaultChecked={defaults?.isVisible ?? false} className={checkCls} />
                  Visible to students
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="salesOpen" defaultChecked={defaults?.salesOpen ?? false} className={checkCls} />
                  Sales open
                </label>
              </div>

              <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="allowReceptionPayment" defaultChecked={defaults?.allowReceptionPayment ?? false} className={checkCls} />
                  Allow pay at reception
                </label>

              <div className="space-y-2 border-t border-gray-100 pt-3">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Promotion</p>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  <label className="flex items-center gap-2 text-sm" title="Highlighted with a star in event listings">
                    <input type="checkbox" name="isFeatured" defaultChecked={defaults?.isFeatured ?? false} className={checkCls} />
                    Featured in listings
                  </label>
                  <label className="flex items-center gap-2 text-sm" title="Shows this event as a card on the student dashboard">
                    <input type="checkbox" name="featuredOnDashboard" defaultChecked={defaults?.featuredOnDashboard ?? false} className={checkCls} />
                    Show on student dashboard
                  </label>
                  <label className="flex items-center gap-2 text-sm" title="Creates a public shareable page for this event">
                    <input type="checkbox" name="isPublic" defaultChecked={defaults?.isPublic ?? false} className={checkCls} />
                    Public page (shareable link)
                  </label>
                </div>
                <p className="text-xs text-gray-400">&ldquo;Featured in listings&rdquo; highlights the event with a star. &ldquo;Show on student dashboard&rdquo; places a card on every student&rsquo;s dashboard.</p>
              </div>
            </div>

            {/* Live student/public appearance preview */}
            {liveTitle && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Student view preview</p>
                <div className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
                  {!previewSrc && (
                    <div className="h-3 bg-gradient-to-r from-bpm-500 via-bpm-coral to-bpm-400 rounded-t-xl" />
                  )}
                  <div className={previewSrc ? "flex flex-row" : ""}>
                    {previewSrc && (
                      <div className="w-24 shrink-0 bg-gray-50 overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={previewSrc} alt="" className="w-full h-auto block" onError={() => {}} />
                      </div>
                    )}
                    <div className="px-3 py-2.5 flex-1 min-w-0">
                      <h4 className="font-semibold text-gray-900 text-sm leading-snug">{liveTitle}</h4>
                      {liveSubtitle && <p className="text-xs text-gray-500 mt-0.5">{liveSubtitle}</p>}
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs text-gray-500">
                        {liveStart && (
                          <span className="flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            {liveEnd ? formatEventDateRange(liveStart, liveEnd) : formatEventDateRange(liveStart, liveStart)}
                          </span>
                        )}
                        {liveLocation && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {liveLocation}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}
          </DialogBody>
          <DialogFooter>
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={isPending} className="rounded-lg bg-bpm-600 px-4 py-2 text-sm font-medium text-white hover:bg-bpm-700 disabled:opacity-50">
              {isPending ? "Saving…" : isEdit ? "Save" : "Create"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════════
// SESSION FORM DIALOG
// ══════════════════════════════════════════════════════════════

export function SessionFormDialog({
  open,
  onClose,
  eventId,
  eventStartDate,
  eventEndDate,
  defaults,
  action,
}: {
  open: boolean;
  onClose: () => void;
  eventId: string;
  eventStartDate?: string;
  eventEndDate?: string;
  defaults?: MockEventSession;
  action: (fd: FormData) => Promise<{ success: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [liveStartTime, setLiveStartTime] = useState(defaults?.startTime ?? "");
  const [liveEndTime, setLiveEndTime] = useState(defaults?.endTime ?? "");
  const isEdit = !!defaults;
  const overnight = liveStartTime.length > 0 && liveEndTime.length > 0 && isOvernightSession(liveStartTime, liveEndTime);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await action(fd);
      if (res.success) { router.refresh(); onClose(); }
      else setError(res.error ?? "Something went wrong");
    });
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader><DialogTitle>{isEdit ? "Edit Session" : "Add Session"}</DialogTitle></DialogHeader>
          <DialogBody className="space-y-4">
            <input type="hidden" name="eventId" value={eventId} />
            {isEdit && <input type="hidden" name="id" value={defaults.id} />}

            <Field label="Title">
              <input name="title" defaultValue={defaults?.title ?? ""} required className={inputCls} />
            </Field>
            <Field label="Session type">
              <select name="sessionType" defaultValue={defaults?.sessionType ?? "workshop"} className={selectCls}>
                <option value="workshop">Workshop</option>
                <option value="social">Social</option>
                <option value="intensive">Intensive</option>
                <option value="masterclass">Masterclass</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Date">
              <input
                type="date"
                name="date"
                defaultValue={defaults?.date ?? ""}
                min={eventStartDate ? eventDateOnly(eventStartDate) : undefined}
                max={eventEndDate ? eventDateOnly(eventEndDate) : undefined}
                required
                className={inputCls}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start time">
                <input type="time" name="startTime" defaultValue={defaults?.startTime ?? ""} required className={inputCls} onChange={(e) => setLiveStartTime(e.target.value)} />
              </Field>
              <Field label="End time">
                <input type="time" name="endTime" defaultValue={defaults?.endTime ?? ""} required className={inputCls} onChange={(e) => setLiveEndTime(e.target.value)} />
              </Field>
            </div>
            {overnight && (
              <p className="text-xs text-amber-600 -mt-2 flex items-center gap-1">
                <Clock className="h-3 w-3" /> Overnight session — ends the following day
              </p>
            )}
            <Field label="Teacher / Artist">
              <input name="teacherName" defaultValue={defaults?.teacherName ?? ""} className={inputCls} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Room">
                <input name="room" defaultValue={defaults?.room ?? ""} className={inputCls} />
              </Field>
              <Field label="Capacity">
                <input type="number" name="capacity" defaultValue={defaults?.capacity ?? ""} min={0} className={inputCls} />
              </Field>
            </div>
            <Field label="Description">
              <textarea name="description" rows={2} defaultValue={defaults?.description ?? ""} className={inputCls} />
            </Field>
            <input type="hidden" name="sortOrder" value={defaults?.sortOrder ?? 0} />

            {error && <p className="text-sm text-red-600">{error}</p>}
          </DialogBody>
          <DialogFooter>
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={isPending} className="rounded-lg bg-bpm-600 px-4 py-2 text-sm font-medium text-white hover:bg-bpm-700 disabled:opacity-50">
              {isPending ? "Saving…" : isEdit ? "Save" : "Add"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════════
// EVENT PRODUCT FORM DIALOG
// ══════════════════════════════════════════════════════════════

export function EventProductFormDialog({
  open,
  onClose,
  eventId,
  sessions,
  defaults,
  action,
}: {
  open: boolean;
  onClose: () => void;
  eventId: string;
  sessions: MockEventSession[];
  defaults?: MockEventProduct;
  action: (fd: FormData) => Promise<{ success: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [inclusionRule, setInclusionRule] = useState<string>(defaults?.inclusionRule ?? "all_sessions");
  const isEdit = !!defaults;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await action(fd);
      if (res.success) { router.refresh(); onClose(); }
      else setError(res.error ?? "Something went wrong");
    });
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader><DialogTitle>{isEdit ? "Edit Product" : "Add Product"}</DialogTitle></DialogHeader>
          <DialogBody className="space-y-4">
            <input type="hidden" name="eventId" value={eventId} />
            {isEdit && <input type="hidden" name="id" value={defaults.id} />}

            <Field label="Name">
              <input name="name" defaultValue={defaults?.name ?? ""} required className={inputCls} />
            </Field>
            <Field label="Description">
              <textarea name="description" rows={2} defaultValue={defaults?.description ?? ""} className={inputCls} />
            </Field>
            <Field label="Price (EUR)">
              <input type="number" name="priceEuros" step="0.01" min="0" defaultValue={defaults ? (defaults.priceCents / 100).toFixed(2) : ""} required className={inputCls} />
            </Field>
            <Field label="Product type">
              <select name="productType" defaultValue={defaults?.productType ?? "other"} className={selectCls}>
                <option value="full_pass">Full Pass</option>
                <option value="combo_pass">Combo Pass</option>
                <option value="single_session">Single Session</option>
                <option value="social_ticket">Social Ticket</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Inclusion rule">
              <select
                name="inclusionRule"
                value={inclusionRule}
                onChange={(e) => setInclusionRule(e.target.value)}
                className={selectCls}
              >
                <option value="all_sessions">All sessions</option>
                <option value="selected_sessions">Selected sessions</option>
                <option value="all_workshops">All workshops</option>
                <option value="socials_only">Socials only</option>
              </select>
            </Field>

            {inclusionRule === "selected_sessions" && sessions.length > 0 && (
              <Field label="Included sessions">
                <div className="space-y-1.5 max-h-40 overflow-y-auto rounded-lg border border-gray-200 p-3">
                  {sessions.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="includedSessionIds"
                        value={s.id}
                        defaultChecked={defaults?.includedSessionIds?.includes(s.id) ?? false}
                        className={checkCls}
                      />
                      {s.title} ({s.date} {s.startTime})
                    </label>
                  ))}
                </div>
              </Field>
            )}

            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isVisible" defaultChecked={defaults?.isVisible ?? true} className={checkCls} />
                Visible
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="salesOpen" defaultChecked={defaults?.salesOpen ?? false} className={checkCls} />
                Sales open
              </label>
            </div>
            <input type="hidden" name="sortOrder" value={defaults?.sortOrder ?? 0} />

            {error && <p className="text-sm text-red-600">{error}</p>}
          </DialogBody>
          <DialogFooter>
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={isPending} className="rounded-lg bg-bpm-600 px-4 py-2 text-sm font-medium text-white hover:bg-bpm-700 disabled:opacity-50">
              {isPending ? "Saving…" : isEdit ? "Save" : "Add"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════════
// CONFIRM DELETE DIALOG
// ══════════════════════════════════════════════════════════════

export function ConfirmDeleteDialog({
  open,
  onClose,
  title,
  message,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  message: string;
  onConfirm: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <DialogBody>
          <p className="text-sm text-gray-600">{message}</p>
        </DialogBody>
        <DialogFooter>
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => startTransition(async () => { onConfirm(); })}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {isPending ? "Deleting…" : "Delete"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

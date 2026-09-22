"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Megaphone,
  Plus,
  Send,
  Trash2,
  Mail,
  BellRing,
  Users,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  Tag,
  MousePointerClick,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AdminHelpButton } from "@/components/admin/admin-help-panel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { AdminTable, Td } from "@/components/ui/admin-table";
import { EmptyState } from "@/components/ui/empty-state";
import { MediaPicker } from "@/components/media/media-picker";
import { formatDate } from "@/lib/utils";
import {
  createBroadcastAction,
  sendBroadcastAction,
  deleteBroadcastAction,
  previewAudienceAction,
  previewTicketHoldersAction,
  type BroadcastRow,
  type BroadcastChannel,
  type TicketHolderPreview,
} from "@/lib/actions/broadcasts";
import {
  type AudienceType,
  AUDIENCE_LABELS,
  EVENT_TICKET_HOLDERS_HELPER,
} from "@/lib/domain/broadcast-types";
import {
  type TicketHolderStatusFilter,
  TICKET_HOLDER_FILTER_LABELS,
  describeTicketHolderCount,
} from "@/lib/domain/event-ticket-holders";
import {
  type CtaDestinationType,
  CTA_DESTINATION_LABELS,
  CTA_DESTINATION_DESCRIPTIONS,
  resolveCtaPath,
} from "@/lib/domain/cta-types";

// ── Constants ────────────────────────────────────────────────

const CATEGORY_OPTIONS = [
  { value: "", label: "No category" },
  { value: "announcement", label: "Announcement" },
  { value: "schedule", label: "Schedule update" },
  { value: "event", label: "Event" },
  { value: "payment", label: "Payment reminder" },
  { value: "product", label: "Product / Offer" },
  { value: "general", label: "General" },
];

const CHANNEL_OPTIONS: { value: BroadcastChannel; label: string; icon: typeof Mail }[] = [
  { value: "in_app", label: "In-app notification", icon: BellRing },
  { value: "email", label: "Email", icon: Mail },
];

const AUDIENCE_OPTIONS: { value: AudienceType; label: string }[] = [
  { value: "all_students", label: AUDIENCE_LABELS.all_students },
  { value: "with_active_subscription", label: AUDIENCE_LABELS.with_active_subscription },
  { value: "with_pending_payment", label: AUDIENCE_LABELS.with_pending_payment },
  { value: "with_membership", label: AUDIENCE_LABELS.with_membership },
  { value: "with_pass", label: AUDIENCE_LABELS.with_pass },
  { value: "without_subscription", label: AUDIENCE_LABELS.without_subscription },
  { value: "specific_students", label: AUDIENCE_LABELS.specific_students },
  { value: "event_ticket_holders", label: AUDIENCE_LABELS.event_ticket_holders },
];

const TICKET_STATUS_OPTIONS: { value: TicketHolderStatusFilter; label: string }[] = [
  { value: "all", label: TICKET_HOLDER_FILTER_LABELS.all },
  { value: "paid_only", label: TICKET_HOLDER_FILTER_LABELS.paid_only },
  { value: "refunded_only", label: TICKET_HOLDER_FILTER_LABELS.refunded_only },
];

const CTA_DEST_OPTIONS: { value: CtaDestinationType | ""; label: string; hint: string }[] = [
  { value: "", label: "No CTA button", hint: "" },
  { value: "browse_classes", label: "Browse classes", hint: "Opens the student classes page" },
  { value: "class", label: "Specific class", hint: "Highlights one class for students to find" },
  { value: "product", label: "Product page", hint: "Opens the catalog to view or buy a product" },
  { value: "event", label: "Event page", hint: "Opens a specific event with tickets" },
  { value: "dashboard", label: "Student dashboard", hint: "Opens the student home screen" },
  { value: "external_url", label: "External URL", hint: "Links to any external website" },
];

interface EntityOption {
  id: string;
  name: string;
}

// ── Main component ───────────────────────────────────────────

/**
 * Phase 17 — event list for the "Event ticket holders" audience.
 * Broader than `eventOptions` (which is the CTA target list) because
 * cancelled and hidden events still have ticket holders to email.
 */
export interface TicketHolderEventOption {
  id: string;
  name: string;
  date: string | null;
  status: string;
}

interface Props {
  broadcasts: BroadcastRow[];
  studentOptions: EntityOption[];
  productOptions: EntityOption[];
  eventOptions: EntityOption[];
  ticketHolderEventOptions: TicketHolderEventOption[];
  classOptions: EntityOption[];
}

export function BroadcastsClient({
  broadcasts,
  studentOptions,
  productOptions,
  eventOptions,
  ticketHolderEventOptions,
  classOptions,
}: Props) {
  const router = useRouter();
  const [showComposer, setShowComposer] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Broadcasts"
        description="Create and send alerts to students via in-app notifications and email."
        actions={
          <>
            <AdminHelpButton pageKey="broadcasts" />
            <Button onClick={() => setShowComposer(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              New broadcast
            </Button>
          </>
        }
      />

      {broadcasts.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No broadcasts yet"
          description="Create your first broadcast to reach your students."
        />
      ) : (
        <AdminTable
          headers={["", "Title", "Audience", "Channels", "Status", "Recipients", "Sent", ""]}
          count={broadcasts.length}
        >
          {broadcasts.map((b) => {
            const isExpanded = expandedId === b.id;
            return (
              <BroadcastTableRow
                key={b.id}
                broadcast={b}
                isExpanded={isExpanded}
                onToggle={() => setExpandedId(isExpanded ? null : b.id)}
                onRefresh={() => router.refresh()}
              />
            );
          })}
        </AdminTable>
      )}

      {showComposer && (
        <ComposerDialog
          studentOptions={studentOptions}
          productOptions={productOptions}
          eventOptions={eventOptions}
          ticketHolderEventOptions={ticketHolderEventOptions}
          classOptions={classOptions}
          onClose={() => setShowComposer(false)}
          onCreated={() => {
            setShowComposer(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// ── Broadcast row ────────────────────────────────────────────

function BroadcastTableRow({
  broadcast: b,
  isExpanded,
  onToggle,
  onRefresh,
}: {
  broadcast: BroadcastRow;
  isExpanded: boolean;
  onToggle: () => void;
  onRefresh: () => void;
}) {
  const [sending, startSend] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleDelete() {
    if (b.status === "sent" && !confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setConfirmDelete(false);
    startDelete(async () => {
      const res = await deleteBroadcastAction(b.id);
      if (!res.success) {
        setResult({ ok: false, msg: res.error ?? "Delete failed" });
      }
      onRefresh();
    });
  }

  const ctaDestLabel = b.ctaDestinationType
    ? (CTA_DESTINATION_LABELS[b.ctaDestinationType] ?? b.ctaDestinationType)
    : null;

  return (
    <>
      <tr className="cursor-pointer hover:bg-gray-50" onClick={onToggle}>
        <Td className="w-8">
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          )}
        </Td>
        <Td className="font-medium text-gray-900 max-w-[220px] truncate">{b.title}</Td>
        <Td>
          <span className="text-xs text-gray-600">
            {AUDIENCE_LABELS[b.audienceType] ?? b.audienceType}
          </span>
        </Td>
        <Td>
          <div className="flex items-center gap-1">
            {b.channels.includes("in_app") && (
              <span title="In-app">
                <BellRing className="h-3.5 w-3.5 text-blue-500" />
              </span>
            )}
            {b.channels.includes("email") && (
              <span title="Email">
                <Mail className="h-3.5 w-3.5 text-amber-500" />
              </span>
            )}
          </div>
        </Td>
        <Td>
          <Badge variant={b.status === "sent" ? "success" : "default"}>
            {b.status === "sent" ? "Sent" : "Draft"}
          </Badge>
        </Td>
        <Td>{b.recipientCount > 0 ? b.recipientCount : "—"}</Td>
        <Td>{b.sentAt ? formatDate(b.sentAt) : "—"}</Td>
        <Td className="w-24">
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {b.status === "draft" && (
              <button
                disabled={sending}
                onClick={() => {
                  startSend(async () => {
                    const res = await sendBroadcastAction(b.id);
                    setResult(
                      res.success
                        ? { ok: true, msg: `Sent to ${res.recipientCount} students` }
                        : { ok: false, msg: res.error ?? "Failed" },
                    );
                    onRefresh();
                  });
                }}
                className="rounded-lg p-1.5 text-green-500 hover:bg-green-50 hover:text-green-700 disabled:opacity-50"
                title="Send now"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            )}
            <button
              disabled={deleting}
              onClick={handleDelete}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              title={
                b.status === "sent"
                  ? "Delete broadcast and remove from student notifications"
                  : "Delete draft"
              }
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </button>
          </div>
        </Td>
      </tr>
      {confirmDelete && (
        <tr>
          <td colSpan={8} className="bg-red-50 px-8 py-3">
            <div className="flex items-center justify-between max-w-xl">
              <p className="text-sm text-red-700">
                This broadcast was already sent to {b.recipientCount} student
                {b.recipientCount !== 1 ? "s" : ""}. Deleting will also remove it from
                their in-app notifications.
              </p>
              <div className="flex items-center gap-2 ml-4 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDelete(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={deleting}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete();
                  }}
                >
                  {deleting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                  Delete
                </Button>
              </div>
            </div>
          </td>
        </tr>
      )}
      {isExpanded && (
        <tr>
          <td colSpan={8} className="bg-gray-50 px-8 py-4">
            <div className="max-w-xl space-y-3">
              {b.category && <Badge variant="default">{b.category}</Badge>}
              {b.imageUrl && (
                <div className="overflow-hidden rounded-lg border border-gray-200 max-w-xs">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={b.imageUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="w-full max-h-40 object-cover"
                  />
                </div>
              )}
              <p className="text-sm text-gray-500 whitespace-pre-wrap">{b.body}</p>
              {b.ctaLabel && b.ctaUrl && (
                <div className="flex items-center gap-2">
                  <a
                    href={b.ctaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-bpm-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-bpm-700 transition-colors"
                  >
                    {b.ctaLabel}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  {ctaDestLabel && (
                    <span className="text-[10px] text-gray-400">({ctaDestLabel})</span>
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-400 pt-2">
                <span>Created by {b.createdBy}</span>
                <span>Created {formatDate(b.createdAt)}</span>
                {b.sentAt && <span>Sent {formatDate(b.sentAt)}</span>}
                {b.emailSentCount > 0 && <span>{b.emailSentCount} emails sent</span>}
              </div>
              {result && (
                <div
                  className={`mt-2 flex items-center gap-1.5 text-xs ${result.ok ? "text-green-600" : "text-red-600"}`}
                >
                  {result.ok ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <AlertCircle className="h-3.5 w-3.5" />
                  )}
                  {result.msg}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Composer dialog ──────────────────────────────────────────

function ComposerDialog({
  studentOptions,
  productOptions,
  eventOptions,
  ticketHolderEventOptions,
  classOptions,
  onClose,
  onCreated,
}: {
  studentOptions: EntityOption[];
  productOptions: EntityOption[];
  eventOptions: EntityOption[];
  ticketHolderEventOptions: TicketHolderEventOption[];
  classOptions: EntityOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [channels, setChannels] = useState<Set<BroadcastChannel>>(new Set(["in_app"]));
  const [audienceType, setAudienceType] = useState<AudienceType>("all_students");
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [studentSearch, setStudentSearch] = useState("");
  // Phase 17 — event ticket holders
  const [ticketEventId, setTicketEventId] = useState("");
  const [ticketEventSearch, setTicketEventSearch] = useState("");
  const [ticketStatus, setTicketStatus] = useState<TicketHolderStatusFilter>("all");
  const [ticketPreview, setTicketPreview] = useState<TicketHolderPreview | null>(null);
  const [showRecipients, setShowRecipients] = useState(false);
  const [ticketPreviewLoading, setTicketPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<{
    count: number;
    names: string[];
    linkedStudentCount?: number;
    guestCount?: number;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"compose" | "confirm">("compose");

  // Extras
  const [showExtras, setShowExtras] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [category, setCategory] = useState("");

  // CTA destination
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaDestType, setCtaDestType] = useState<CtaDestinationType | "">("");
  const [ctaTargetId, setCtaTargetId] = useState("");
  const [ctaExternalUrl, setCtaExternalUrl] = useState("");

  function toggleChannel(ch: BroadcastChannel) {
    setChannels((prev) => {
      const next = new Set(prev);
      if (next.has(ch)) {
        if (next.size === 1) return next;
        next.delete(ch);
      } else {
        next.add(ch);
      }
      return next;
    });
  }

  async function loadPreview() {
    setPreviewLoading(true);
    try {
      const res = await previewAudienceAction(audienceType, buildAudienceParams());
      setPreview({
        count: res.count,
        names: res.sampleNames,
        linkedStudentCount: res.linkedStudentCount,
        guestCount: res.guestCount,
      });
    } catch {
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }

  /**
   * Single source of truth for audience params, used by both the
   * preview and the create call so they can never drift.
   */
  function buildAudienceParams() {
    if (audienceType === "specific_students") {
      return { studentIds: [...selectedStudents] };
    }
    if (audienceType === "event_ticket_holders") {
      return { eventId: ticketEventId, ticketHolderStatus: ticketStatus };
    }
    return {};
  }

  /** Resolve the full recipient list for the preview table. */
  async function loadTicketHolderPreview() {
    if (!ticketEventId) return;
    setTicketPreviewLoading(true);
    try {
      const res = await previewTicketHoldersAction(ticketEventId, ticketStatus);
      setTicketPreview(res.success && res.preview ? res.preview : null);
    } catch {
      setTicketPreview(null);
    } finally {
      setTicketPreviewLoading(false);
    }
  }

  // Re-resolve whenever the event or status filter changes so the
  // "X unique ticket holders" summary is never stale.
  useEffect(() => {
    if (audienceType !== "event_ticket_holders" || !ticketEventId) {
      setTicketPreview(null);
      return;
    }
    void loadTicketHolderPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audienceType, ticketEventId, ticketStatus]);

  const filteredTicketEvents = ticketHolderEventOptions.filter((e) =>
    e.name.toLowerCase().includes(ticketEventSearch.trim().toLowerCase()),
  );

  const needsTarget =
    ctaDestType === "product" || ctaDestType === "event" || ctaDestType === "class";
  const resolvedCtaPreview = ctaDestType
    ? resolveCtaPath({
        type: ctaDestType,
        targetId: ctaTargetId || undefined,
        externalUrl: ctaExternalUrl || undefined,
      })
    : null;
  const selectedCtaOption = CTA_DEST_OPTIONS.find((o) => o.value === ctaDestType);

  function handleNext() {
    setError(null);
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!body.trim()) {
      setError("Message body is required.");
      return;
    }
    if (ctaDestType && !ctaLabel.trim()) {
      setError("CTA button needs a label.");
      return;
    }
    if (ctaDestType === "external_url" && !ctaExternalUrl.trim()) {
      setError("External URL is required for this CTA type.");
      return;
    }
    if (needsTarget && !ctaTargetId) {
      const label =
        ctaDestType === "product" ? "product" : ctaDestType === "class" ? "class" : "event";
      setError(`Select a ${label} for the CTA button.`);
      return;
    }
    if (audienceType === "specific_students" && selectedStudents.size === 0) {
      setError("Select at least one student.");
      return;
    }
    if (audienceType === "event_ticket_holders") {
      if (!ticketEventId) {
        setError("Select an event for this audience.");
        return;
      }
      // Guests have no account, so an in-app-only broadcast would
      // reach none of them. Catch it here rather than at send time.
      if (!channels.has("email") && (ticketPreview?.guestCount ?? 0) > 0) {
        setError(
          "This audience includes guest ticket holders, who can only be reached by email. Add the Email channel.",
        );
        return;
      }
    }
    loadPreview();
    setStep("confirm");
  }

  function handleCreate() {
    startSave(async () => {
      const params = buildAudienceParams();

      const ctaUrl = ctaDestType === "external_url" ? ctaExternalUrl.trim() : undefined;

      const res = await createBroadcastAction({
        title: title.trim(),
        body: body.trim(),
        channels: [...channels],
        audienceType,
        audienceParams: params,
        imageUrl: imageUrl || undefined,
        ctaLabel: ctaLabel.trim() || undefined,
        ctaUrl,
        ctaDestinationType: ctaDestType || undefined,
        ctaDestinationId: needsTarget ? ctaTargetId : undefined,
        category: category || undefined,
      });
      if (!res.success) {
        setError(res.error ?? "Failed to create broadcast.");
        setStep("compose");
        return;
      }
      if (res.id) {
        const sendRes = await sendBroadcastAction(res.id);
        if (!sendRes.success) {
          setError(sendRes.error ?? "Broadcast created but failed to send.");
        }
      }
      onCreated();
    });
  }

  const filteredStudents = studentSearch
    ? studentOptions.filter((s) =>
        s.name.toLowerCase().includes(studentSearch.toLowerCase()),
      )
    : studentOptions;

  const targetOptions =
    ctaDestType === "product"
      ? productOptions
      : ctaDestType === "class"
        ? classOptions
        : eventOptions;

  return (
    <Dialog open onClose={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === "compose" ? "New Broadcast" : "Confirm & Send"}
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          {step === "compose" ? (
            <div className="space-y-4">
              {error && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. New term starts next week!"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-bpm-500 focus:outline-none focus:ring-2 focus:ring-bpm-100"
                />
              </div>

              {/* Message */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Message
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={4}
                  placeholder="Write your message to students..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-bpm-500 focus:outline-none focus:ring-2 focus:ring-bpm-100 resize-y"
                />
              </div>

              {/* Extras toggle */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowExtras(!showExtras)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
                >
                  {showExtras ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                  {showExtras ? "Hide extras" : "Add image, CTA button, or category"}
                </button>

                {showExtras && (
                  <div className="mt-3 space-y-4 rounded-lg border border-gray-200 bg-gray-50/50 p-3">
                    {/* Image picker */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">
                        Image (optional)
                      </label>
                      <MediaPicker
                        kind="broadcasts"
                        value={imageUrl}
                        onChange={setImageUrl}
                      />
                    </div>

                    {/* CTA destination */}
                    <div className="space-y-2">
                      <label className="flex items-center gap-1 text-xs font-medium text-gray-600">
                        <MousePointerClick className="h-3.5 w-3.5" />
                        CTA button (optional)
                      </label>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <select
                            value={ctaDestType}
                            onChange={(e) => {
                              setCtaDestType(
                                e.target.value as CtaDestinationType | "",
                              );
                              setCtaTargetId("");
                              setCtaExternalUrl("");
                            }}
                            className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-bpm-500 focus:outline-none focus:ring-2 focus:ring-bpm-100"
                          >
                            {CTA_DEST_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <input
                            value={ctaLabel}
                            onChange={(e) => setCtaLabel(e.target.value)}
                            placeholder="Button label"
                            disabled={!ctaDestType}
                            className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-bpm-500 focus:outline-none focus:ring-2 focus:ring-bpm-100 disabled:opacity-50"
                          />
                        </div>
                      </div>

                      {/* Target selector for product/event */}
                      {needsTarget && (
                        <select
                          value={ctaTargetId}
                          onChange={(e) => setCtaTargetId(e.target.value)}
                          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-bpm-500 focus:outline-none focus:ring-2 focus:ring-bpm-100"
                        >
                          <option value="">
                            Select{" "}
                            {ctaDestType === "product"
                              ? "a product"
                              : ctaDestType === "class"
                                ? "a class"
                                : "an event"}
                            ...
                          </option>
                          {targetOptions.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.name}
                            </option>
                          ))}
                        </select>
                      )}

                      {/* External URL input */}
                      {ctaDestType === "external_url" && (
                        <input
                          value={ctaExternalUrl}
                          onChange={(e) => setCtaExternalUrl(e.target.value)}
                          placeholder="https://..."
                          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-bpm-500 focus:outline-none focus:ring-2 focus:ring-bpm-100"
                        />
                      )}

                      {/* Inline description for selected CTA type */}
                      {selectedCtaOption?.hint && (
                        <p className="text-[11px] text-gray-400 leading-tight">
                          {selectedCtaOption.hint}
                        </p>
                      )}

                      {/* Resolved preview */}
                      {ctaDestType && resolvedCtaPreview && (
                        <div className="rounded bg-gray-100 px-2 py-1 text-[11px] text-gray-500 font-mono truncate">
                          → {resolvedCtaPreview}
                        </div>
                      )}
                    </div>

                    {/* Category */}
                    <div>
                      <label className="flex items-center gap-1 text-xs font-medium text-gray-600 mb-1">
                        <Tag className="h-3.5 w-3.5" />
                        Category (optional)
                      </label>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-bpm-500 focus:outline-none focus:ring-2 focus:ring-bpm-100"
                      >
                        {CATEGORY_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Channels */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Delivery channels
                </label>
                <div className="flex gap-2">
                  {CHANNEL_OPTIONS.map((ch) => {
                    const Icon = ch.icon;
                    const active = channels.has(ch.value);
                    return (
                      <button
                        key={ch.value}
                        type="button"
                        onClick={() => toggleChannel(ch.value)}
                        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                          active
                            ? "border-bpm-500 bg-bpm-50 text-bpm-700"
                            : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {ch.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Audience */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Audience
                </label>
                <select
                  value={audienceType}
                  onChange={(e) => {
                    setAudienceType(e.target.value as AudienceType);
                    setSelectedStudents(new Set());
                    setTicketEventId("");
                    setTicketStatus("all");
                    setTicketPreview(null);
                  }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-bpm-500 focus:outline-none focus:ring-2 focus:ring-bpm-100"
                >
                  {AUDIENCE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Phase 17 — Event ticket holders */}
              {audienceType === "event_ticket_holders" && (
                <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">{EVENT_TICKET_HOLDERS_HELPER}</p>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Select event
                    </label>
                    <input
                      value={ticketEventSearch}
                      onChange={(e) => setTicketEventSearch(e.target.value)}
                      placeholder="Search events by title..."
                      className="mb-2 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-bpm-500 focus:outline-none focus:ring-2 focus:ring-bpm-100"
                    />
                    <select
                      value={ticketEventId}
                      onChange={(e) => setTicketEventId(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-bpm-500 focus:outline-none focus:ring-2 focus:ring-bpm-100"
                    >
                      <option value="">Select event</option>
                      {filteredTicketEvents.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                          {e.date ? ` — ${formatDate(e.date)}` : ""}
                          {e.status !== "published" ? ` (${e.status})` : ""}
                        </option>
                      ))}
                    </select>
                    {filteredTicketEvents.length === 0 && (
                      <p className="mt-1 text-xs text-gray-400">No events match that search.</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Ticket holders to include
                    </label>
                    <select
                      value={ticketStatus}
                      onChange={(e) =>
                        setTicketStatus(e.target.value as TicketHolderStatusFilter)
                      }
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-bpm-500 focus:outline-none focus:ring-2 focus:ring-bpm-100"
                    >
                      {TICKET_STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-gray-400">
                      All ticket holders includes refunded purchasers, which is
                      usually what you want for cancellations and venue changes.
                    </p>
                  </div>

                  {/* Recipient summary */}
                  {ticketEventId && (
                    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                      {ticketPreviewLoading ? (
                        <span className="flex items-center gap-2 text-sm text-gray-400">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Resolving ticket holders...
                        </span>
                      ) : ticketPreview ? (
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-gray-900">
                            Recipients: {describeTicketHolderCount(ticketPreview.totalRecipients)}
                          </p>
                          <p className="text-xs text-gray-500">
                            {ticketPreview.linkedStudentCount} linked student
                            {ticketPreview.linkedStudentCount === 1 ? "" : "s"} ·{" "}
                            {ticketPreview.guestCount} guest
                            {ticketPreview.guestCount === 1 ? "" : "s"}
                          </p>
                          {(ticketPreview.excludedUnpaidCount > 0 ||
                            ticketPreview.excludedNoEmailCount > 0 ||
                            ticketPreview.duplicatesCollapsed > 0) && (
                            <p className="text-xs text-gray-400">
                              {[
                                ticketPreview.duplicatesCollapsed > 0
                                  ? `${ticketPreview.duplicatesCollapsed} duplicate email${ticketPreview.duplicatesCollapsed === 1 ? "" : "s"} merged`
                                  : null,
                                ticketPreview.excludedUnpaidCount > 0
                                  ? `${ticketPreview.excludedUnpaidCount} unpaid purchase${ticketPreview.excludedUnpaidCount === 1 ? "" : "s"} excluded`
                                  : null,
                                ticketPreview.excludedNoEmailCount > 0
                                  ? `${ticketPreview.excludedNoEmailCount} with no email address excluded`
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          )}
                          {ticketPreview.totalRecipients > 0 && (
                            <button
                              type="button"
                              onClick={() => setShowRecipients(true)}
                              className="text-xs font-medium text-bpm-600 hover:text-bpm-700 hover:underline"
                            >
                              Preview recipient list
                            </button>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400">
                          Could not resolve ticket holders for this event.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Student multi-select */}
              {audienceType === "specific_students" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Select students ({selectedStudents.size} selected)
                  </label>
                  <input
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    placeholder="Search students..."
                    className="mb-2 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-bpm-500 focus:outline-none focus:ring-2 focus:ring-bpm-100"
                  />
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200 bg-white">
                    {filteredStudents.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-gray-400">
                        No students match
                      </div>
                    ) : (
                      filteredStudents.map((s) => (
                        <label
                          key={s.id}
                          className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedStudents.has(s.id)}
                            onChange={() => {
                              setSelectedStudents((prev) => {
                                const next = new Set(prev);
                                next.has(s.id) ? next.delete(s.id) : next.add(s.id);
                                return next;
                              });
                            }}
                            className="rounded border-gray-300 text-bpm-600 focus:ring-bpm-500"
                          />
                          {s.name}
                        </label>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ── Confirm step ── */
            <div className="space-y-4">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
                {category && <Badge variant="default">{category}</Badge>}
                <h4 className="font-semibold text-gray-900">{title}</h4>
                {imageUrl && (
                  <div className="overflow-hidden rounded-lg border border-gray-200 max-w-[200px]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imageUrl}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="w-full max-h-32 object-cover"
                    />
                  </div>
                )}
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{body}</p>
                {ctaDestType && ctaLabel && (
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-1.5 rounded-lg bg-bpm-600 px-3 py-1.5 text-xs font-medium text-white">
                      {ctaLabel}
                      <ExternalLink className="h-3 w-3" />
                    </div>
                    {resolvedCtaPreview && (
                      <div className="text-[10px] text-gray-400 font-mono">
                        → {resolvedCtaPreview}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <div>
                  <span className="text-gray-500">Channels: </span>
                  <span className="font-medium text-gray-800">
                    {[...channels]
                      .map((c) => (c === "in_app" ? "In-app" : "Email"))
                      .join(", ")}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Audience: </span>
                  <span className="font-medium text-gray-800">
                    {AUDIENCE_LABELS[audienceType]}
                  </span>
                </div>
              </div>
              {previewLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Calculating audience...
                </div>
              ) : preview ? (
                <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-blue-800">
                    <Users className="h-4 w-4" />
                    {audienceType === "event_ticket_holders"
                      ? `${describeTicketHolderCount(preview.count)} will receive this broadcast`
                      : `${preview.count} student${preview.count !== 1 ? "s" : ""} will receive this broadcast`}
                  </div>
                  {audienceType === "event_ticket_holders" &&
                    preview.guestCount !== undefined && (
                      <p className="mt-1 text-xs text-blue-700">
                        {preview.linkedStudentCount} linked student
                        {preview.linkedStudentCount === 1 ? "" : "s"}
                        {channels.has("in_app") && channels.has("email")
                          ? " (email + in-app)"
                          : ""}{" "}
                        · {preview.guestCount} guest
                        {preview.guestCount === 1 ? "" : "s"} (email only)
                      </p>
                    )}
                  {preview.names.length > 0 && (
                    <p className="mt-1 text-xs text-blue-600">
                      {preview.names.join(", ")}
                      {preview.count > preview.names.length &&
                        `, and ${preview.count - preview.names.length} more`}
                    </p>
                  )}
                </div>
              ) : null}
              {audienceType === "event_ticket_holders" &&
                (ticketPreview?.guestCount ?? 0) > 0 &&
                !channels.has("email") && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    {ticketPreview!.guestCount} guest ticket holder
                    {ticketPreview!.guestCount === 1 ? "" : "s"} cannot be reached
                    without the Email channel — they have no BPM account for an
                    in-app notification.
                  </div>
                )}
              {error && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          {step === "compose" ? (
            <>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleNext}>Review &amp; send</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep("compose")}>
                Back
              </Button>
              <Button onClick={handleCreate} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="mr-1.5 h-4 w-4" />
                    Send broadcast
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>

      {/* Phase 17 — resolved recipient list, so no copy/paste is needed */}
      {showRecipients && ticketPreview && (
        <RecipientPreviewDialog
          preview={ticketPreview}
          onClose={() => setShowRecipients(false)}
        />
      )}
    </Dialog>
  );
}

// ── Recipient preview (event ticket holders) ─────────────────

/**
 * Read-only table of exactly who this broadcast will reach.
 *
 * Shown so an admin can sanity-check a cancellation email before
 * sending — especially the guest/student split and whether refunded
 * purchasers are included. Purely informational: the send action
 * re-resolves the audience server-side, so nothing shown here is
 * trusted as the delivery list.
 */
function RecipientPreviewDialog({
  preview,
  onClose,
}: {
  preview: TicketHolderPreview;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const rows = q
    ? preview.recipients.filter(
        (r) => r.name.toLowerCase().includes(q) || r.email.includes(q),
      )
    : preview.recipients;

  return (
    <Dialog open onClose={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Recipients — {preview.eventName}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium text-gray-900">
              {describeTicketHolderCount(preview.totalRecipients)}
            </p>
            <p className="text-xs text-gray-500">
              {preview.linkedStudentCount} linked student
              {preview.linkedStudentCount === 1 ? "" : "s"} · {preview.guestCount} guest
              {preview.guestCount === 1 ? "" : "s"}
            </p>
          </div>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by name or email..."
            className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-bpm-500 focus:outline-none focus:ring-2 focus:ring-bpm-100"
          />

          <div className="max-h-80 overflow-y-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-center text-xs text-gray-400">
                      No recipients match that filter.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.email} className="hover:bg-gray-50">
                      <td className="px-3 py-1.5 text-gray-900">
                        {r.name}
                        {r.purchaseCount > 1 && (
                          <span className="ml-1 text-xs text-gray-400">
                            ({r.purchaseCount} tickets)
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-xs text-gray-600">
                        {r.email}
                      </td>
                      <td className="px-3 py-1.5">
                        <Badge variant={r.paymentStatus === "paid" ? "success" : "warning"}>
                          {r.paymentStatus === "paid" ? "Paid" : "Refunded"}
                        </Badge>
                      </td>
                      <td className="px-3 py-1.5">
                        <Badge variant={r.isGuest ? "default" : "muted"}>
                          {r.isGuest ? "Guest" : "Student"}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {(preview.excludedUnpaidCount > 0 || preview.excludedNoEmailCount > 0) && (
            <p className="text-xs text-gray-500">
              Not included:{" "}
              {[
                preview.excludedUnpaidCount > 0
                  ? `${preview.excludedUnpaidCount} unpaid or abandoned purchase${preview.excludedUnpaidCount === 1 ? "" : "s"}`
                  : null,
                preview.excludedNoEmailCount > 0
                  ? `${preview.excludedNoEmailCount} purchase${preview.excludedNoEmailCount === 1 ? "" : "s"} with no email address`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              .
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

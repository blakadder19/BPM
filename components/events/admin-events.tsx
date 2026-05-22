"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Star, Eye, EyeOff, Sparkles, Archive, ArchiveRestore } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { SelectFilter } from "@/components/ui/select-filter";
import { AdminTable, Td } from "@/components/ui/admin-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { AdminHelpButton } from "@/components/admin/admin-help-panel";
import { EventFormDialog } from "./event-dialogs";
import {
  createEventAction,
  deleteEventAction,
  archiveEventAction,
  unarchiveEventAction,
} from "@/lib/actions/special-events";
import { formatEventDateRange } from "@/lib/utils";
import { isEventPast } from "@/lib/domain/event-visibility";
import type { MockSpecialEvent } from "@/lib/mock-data";

/**
 * Plain-boolean permissions resolved server-side from the current
 * staff access. Each flag corresponds 1:1 to a permission key checked
 * by the matching server action.
 */
export interface AdminEventsPermissions {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canMarkPaid: boolean;
}

interface AdminEventsProps {
  events: MockSpecialEvent[];
  sessionCountMap: Record<string, number>;
  productCountMap: Record<string, number>;
  permissions: AdminEventsPermissions;
}

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

export function AdminEvents({
  events,
  sessionCountMap,
  productCountMap,
  permissions,
}: AdminEventsProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MockSpecialEvent | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const isReadOnly = !permissions.canCreate && !permissions.canEdit && !permissions.canDelete;

  const filtered = events.filter((e) => {
    if (statusFilter) {
      // Phase 4: "archived" is a virtual status (filters on archived_at).
      if (statusFilter === "archived" && !e.archivedAt) return false;
      if (statusFilter !== "archived" && e.archivedAt) return false;
      if (statusFilter !== "archived" && e.status !== statusFilter) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      return e.title.toLowerCase().includes(q) || (e.subtitle?.toLowerCase().includes(q) ?? false);
    }
    return true;
  });

  async function handleToggleArchive(evt: MockSpecialEvent) {
    setArchiveError(null);
    const action = evt.archivedAt ? unarchiveEventAction : archiveEventAction;
    const result = await action(evt.id);
    if (!result.success) {
      setArchiveError(result.error ?? "Failed to update archive state.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Special Events"
        description="Guest artist weekends, workshops, socials, and bootcamps"
        actions={
          <>
            <AdminHelpButton pageKey="events" />
            {permissions.canCreate && (
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-1.5 rounded-lg bg-bpm-600 px-3 py-2 text-sm font-medium text-white hover:bg-bpm-700"
              >
                <Plus className="h-4 w-4" /> New Event
              </button>
            )}
          </>
        }
      />

      {isReadOnly && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          You have view-only access to Events. Create, edit, and delete actions
          are hidden.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search events…" />
        <SelectFilter options={STATUS_OPTIONS} value={statusFilter} onChange={setStatusFilter} />
      </div>

      {archiveError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {archiveError}
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No events found"
          description={events.length === 0 ? "Create your first special event to get started." : "Try adjusting your filters."}
        />
      ) : (
        <AdminTable headers={["Event", "Dates", "Status", "Sessions", "Products", "Flags", ""]} count={filtered.length}>
          {filtered.map((evt) => (
            <tr key={evt.id} className="hover:bg-gray-50">
              <Td>
                <Link href={`/events/${evt.id}`} className="font-medium text-bpm-700 hover:underline">
                  {evt.title}
                </Link>
                {evt.subtitle && <span className="ml-1 text-gray-500 text-xs">{evt.subtitle}</span>}
              </Td>
              <Td>{formatEventDateRange(evt.startDate, evt.endDate)}</Td>
              <Td>
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={evt.status} />
                  {evt.archivedAt && (
                    <Badge variant="neutral" title={`Archived ${new Date(evt.archivedAt).toLocaleDateString()}`}>
                      <Archive className="h-3 w-3 mr-0.5 inline" /> Archived
                    </Badge>
                  )}
                  {isEventPast(evt) && !evt.archivedAt && (
                    <Badge variant="muted">Past</Badge>
                  )}
                </div>
              </Td>
              <Td>{sessionCountMap[evt.id] ?? 0}</Td>
              <Td>{productCountMap[evt.id] ?? 0}</Td>
              <Td>
                <div className="flex items-center gap-1.5">
                  {evt.isFeatured && (
                    <span title="Featured"><Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" /></span>
                  )}
                  {evt.isVisible ? (
                    <span title="Visible"><Eye className="h-3.5 w-3.5 text-green-600" /></span>
                  ) : (
                    <span title="Hidden"><EyeOff className="h-3.5 w-3.5 text-gray-400" /></span>
                  )}
                  {evt.salesOpen && (
                    <Badge variant="success">Sales open</Badge>
                  )}
                </div>
              </Td>
              <Td>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/events/${evt.id}`} className="text-xs text-bpm-600 hover:underline">
                    {permissions.canEdit ? "Manage" : "View"}
                  </Link>
                  {permissions.canEdit && (
                    <button
                      onClick={() => handleToggleArchive(evt)}
                      className="text-xs text-gray-600 hover:underline flex items-center gap-0.5"
                      title={
                        evt.archivedAt
                          ? "Restore — make eligible for public surfaces again"
                          : "Archive — hide from public surfaces, keep all history"
                      }
                    >
                      {evt.archivedAt ? (
                        <>
                          <ArchiveRestore className="h-3 w-3" /> Unarchive
                        </>
                      ) : (
                        <>
                          <Archive className="h-3 w-3" /> Archive
                        </>
                      )}
                    </button>
                  )}
                  {permissions.canDelete && (
                    <button
                      onClick={() => {
                        setDeleteError(null);
                        setDeleteTarget(evt);
                      }}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </Td>
            </tr>
          ))}
        </AdminTable>
      )}

      {permissions.canCreate && (
        <EventFormDialog
          open={showAdd}
          onClose={() => setShowAdd(false)}
          action={createEventAction}
        />
      )}

      {deleteTarget && permissions.canDelete && (
        <DeleteEventDialog
          event={deleteTarget}
          onClose={() => {
            setDeleteTarget(null);
            setDeleteError(null);
          }}
          error={deleteError}
          canArchive={permissions.canEdit}
          onConfirm={async () => {
            const result = await deleteEventAction(deleteTarget.id);
            if (!result.success) {
              setDeleteError(result.error ?? "Delete failed.");
              return;
            }
            setDeleteTarget(null);
            setDeleteError(null);
            router.refresh();
          }}
          onArchiveInstead={async () => {
            const result = await archiveEventAction(deleteTarget.id);
            if (!result.success) {
              setDeleteError(result.error ?? "Archive failed.");
              return;
            }
            setDeleteTarget(null);
            setDeleteError(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/**
 * Phase 4 — delete dialog with inline history-error handling.
 *
 * Behaves like the generic ConfirmDeleteDialog, but additionally:
 *   * surfaces an error banner after the server rejects with
 *     DELETE_BLOCKED_MESSAGE,
 *   * offers a one-click "Archive instead" CTA when the error is
 *     showing and the user has `events:edit`.
 */
function DeleteEventDialog({
  event,
  onClose,
  error,
  canArchive,
  onConfirm,
  onArchiveInstead,
}: {
  event: MockSpecialEvent;
  onClose: () => void;
  error: string | null;
  canArchive: boolean;
  onConfirm: () => Promise<void> | void;
  onArchiveInstead: () => Promise<void> | void;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Event</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className="text-sm text-gray-600">
            Are you sure you want to delete &quot;{event.title}&quot;? This will also
            delete all sessions, products, and purchase records for this event.
            This cannot be undone.
          </p>
          {error && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">{error}</p>
              <p className="mt-1 text-xs text-amber-800">
                Archiving keeps all purchases, payments, check-ins and
                finance records intact while hiding the event from public
                surfaces.
              </p>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          {error && canArchive && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => startTransition(async () => { await onArchiveInstead(); })}
              className="rounded-lg bg-bpm-600 px-4 py-2 text-sm font-medium text-white hover:bg-bpm-700 disabled:opacity-50"
            >
              {isPending ? "Archiving…" : "Archive instead"}
            </button>
          )}
          <button
            type="button"
            disabled={isPending}
            onClick={() => startTransition(async () => { await onConfirm(); })}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {isPending ? "Deleting…" : "Delete"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

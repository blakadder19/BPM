"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Star, Eye, EyeOff, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { SelectFilter } from "@/components/ui/select-filter";
import { AdminTable, Td } from "@/components/ui/admin-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { AdminHelpButton } from "@/components/admin/admin-help-panel";
import { EventFormDialog, ConfirmDeleteDialog } from "./event-dialogs";
import { createEventAction, deleteEventAction } from "@/lib/actions/special-events";
import { formatEventDateRange } from "@/lib/utils";
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
  const isReadOnly = !permissions.canCreate && !permissions.canEdit && !permissions.canDelete;

  const filtered = events.filter((e) => {
    if (statusFilter && e.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return e.title.toLowerCase().includes(q) || (e.subtitle?.toLowerCase().includes(q) ?? false);
    }
    return true;
  });

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
              <Td><StatusBadge status={evt.status} /></Td>
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
                <div className="flex gap-2">
                  <Link href={`/events/${evt.id}`} className="text-xs text-bpm-600 hover:underline">
                    {permissions.canEdit ? "Manage" : "View"}
                  </Link>
                  {permissions.canDelete && (
                    <button
                      onClick={() => setDeleteTarget(evt)}
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
        <ConfirmDeleteDialog
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          title="Delete Event"
          message={`Are you sure you want to delete "${deleteTarget.title}"? This will also delete all sessions, products, and purchase records for this event. This cannot be undone.`}
          onConfirm={async () => {
            await deleteEventAction(deleteTarget.id);
            setDeleteTarget(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

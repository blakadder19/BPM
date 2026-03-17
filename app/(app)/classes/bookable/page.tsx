"use client";

import { useState, useMemo, Fragment } from "react";
import { Inbox, ChevronDown, ChevronUp } from "lucide-react";
import { BOOKABLE_CLASSES, WAITLIST_ENTRIES } from "@/lib/mock-data";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { SelectFilter } from "@/components/ui/select-filter";
import { StatusBadge } from "@/components/ui/status-badge";
import { AdminTable, Td } from "@/components/ui/admin-table";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, formatTime } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "scheduled", label: "Scheduled" },
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "cancelled", label: "Cancelled" },
];

const TYPE_OPTIONS = [
  { value: "class", label: "Class" },
  { value: "social", label: "Social" },
  { value: "student_practice", label: "Practice" },
];

function CapacityCell({ bc }: { bc: (typeof BOOKABLE_CLASSES)[number] }) {
  if (bc.classType === "social") {
    return <span className="text-gray-400">Not bookable</span>;
  }
  if (bc.maxCapacity == null) {
    return <span>—</span>;
  }

  const hasRoleCaps = bc.leaderCap != null && bc.followerCap != null;

  return (
    <div>
      <span>
        {bc.bookedCount} / {bc.maxCapacity}
      </span>
      {hasRoleCaps && (
        <span className="ml-1.5 text-xs text-gray-400">
          ({bc.leaderCount}L / {bc.followerCount}F)
        </span>
      )}
      {bc.waitlistCount > 0 && (
        <span className="ml-1.5 text-xs text-amber-600">
          +{bc.waitlistCount} waitlist
        </span>
      )}
    </div>
  );
}

function WaitlistDetailRow({ classId }: { classId: string }) {
  const entries = WAITLIST_ENTRIES.filter(
    (w) => w.bookableClassId === classId && w.status === "waiting"
  ).sort((a, b) => a.position - b.position);

  if (entries.length === 0) {
    return (
      <tr>
        <td colSpan={8} className="bg-gray-50 px-6 py-3 text-sm text-gray-400">
          No students on waitlist.
        </td>
      </tr>
    );
  }

  return (
    <>
      <tr>
        <td colSpan={8} className="bg-gray-50 px-6 py-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Waitlist ({entries.length})
          </p>
        </td>
      </tr>
      {entries.map((w) => (
        <tr key={w.id} className="bg-gray-50/50">
          <Td className="pl-10 text-gray-600">#{w.position}</Td>
          <Td className="font-medium text-gray-900">{w.studentName}</Td>
          <Td>
            {w.danceRole ? <StatusBadge status={w.danceRole} /> : "—"}
          </Td>
          <Td><StatusBadge status={w.status} /></Td>
          <Td className="text-xs text-gray-500">
            Joined {formatDate(w.joinedAt)}
          </Td>
          <td colSpan={3} />
        </tr>
      ))}
    </>
  );
}

export default function BookableClassesPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [expandedClass, setExpandedClass] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return BOOKABLE_CLASSES.filter((bc) => {
      if (q && !bc.title.toLowerCase().includes(q)) return false;
      if (statusFilter && bc.status !== statusFilter) return false;
      if (typeFilter && bc.classType !== typeFilter) return false;
      return true;
    });
  }, [search, statusFilter, typeFilter]);

  function toggleExpand(classId: string) {
    setExpandedClass((prev) => (prev === classId ? null : classId));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Schedule"
        description="Dated class instances — open for booking or past."
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-64">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by title…"
          />
        </div>
        <SelectFilter
          value={statusFilter}
          onChange={setStatusFilter}
          options={STATUS_OPTIONS}
          placeholder="All Statuses"
        />
        <SelectFilter
          value={typeFilter}
          onChange={setTypeFilter}
          options={TYPE_OPTIONS}
          placeholder="All Types"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No bookable classes found"
          description="Try adjusting your search or filters."
        />
      ) : (
        <AdminTable
          headers={["Title", "Type", "Date", "Time", "Status", "Capacity", "Location", ""]}
          count={filtered.length}
        >
          {filtered.map((bc) => (
            <Fragment key={bc.id}>
              <tr className="hover:bg-gray-50">
                <Td className="font-medium text-gray-900">{bc.title}</Td>
                <Td>
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={bc.classType} />
                    {bc.classType === "student_practice" && (
                      <StatusBadge status="provisional" />
                    )}
                  </div>
                </Td>
                <Td>{formatDate(bc.date)}</Td>
                <Td>{formatTime(bc.startTime)} – {formatTime(bc.endTime)}</Td>
                <Td><StatusBadge status={bc.status} /></Td>
                <Td><CapacityCell bc={bc} /></Td>
                <Td>{bc.location}</Td>
                <Td>
                  {bc.waitlistCount > 0 && (
                    <button
                      onClick={() => toggleExpand(bc.id)}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50"
                    >
                      Waitlist
                      {expandedClass === bc.id ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </button>
                  )}
                </Td>
              </tr>
              {expandedClass === bc.id && (
                <WaitlistDetailRow classId={bc.id} />
              )}
            </Fragment>
          ))}
        </AdminTable>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { SelectFilter } from "@/components/ui/select-filter";
import { StatusBadge } from "@/components/ui/status-badge";
import { AdminTable, Td } from "@/components/ui/admin-table";
import { formatDate, formatTime } from "@/lib/utils";
import type { BookingView } from "@/app/(app)/bookings/page";

const STATUS_OPTIONS = [
  { value: "confirmed", label: "Confirmed" },
  { value: "checked_in", label: "Checked In" },
  { value: "cancelled", label: "Cancelled" },
];

const ROLE_OPTIONS = [
  { value: "leader", label: "Leader" },
  { value: "follower", label: "Follower" },
  { value: "none", label: "No role" },
];

export function AdminBookings({ bookings, initialSearch }: { bookings: BookingView[]; initialSearch?: string }) {
  const [search, setSearch] = useState(initialSearch ?? "");
  const [statusFilter, setStatusFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");

  const q = search.toLowerCase();

  const filtered = bookings.filter((b) => {
    if (
      q &&
      !b.studentName.toLowerCase().includes(q) &&
      !b.classTitle.toLowerCase().includes(q)
    ) {
      return false;
    }
    if (statusFilter && b.status !== statusFilter) return false;
    if (roleFilter === "none" && b.danceRole !== null) return false;
    if (roleFilter && roleFilter !== "none" && b.danceRole !== roleFilter)
      return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bookings"
        description="All student bookings across classes."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="w-full sm:max-w-xs">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by student or class…"
          />
        </div>
        <SelectFilter
          value={statusFilter}
          onChange={setStatusFilter}
          options={STATUS_OPTIONS}
          placeholder="All statuses"
        />
        <SelectFilter
          value={roleFilter}
          onChange={setRoleFilter}
          options={ROLE_OPTIONS}
          placeholder="All roles"
        />
      </div>

      <AdminTable
        headers={[
          "Student",
          "Class",
          "Date",
          "Time",
          "Role",
          "Status",
          "Booked At",
        ]}
        count={filtered.length}
      >
        {filtered.map((b) => (
          <tr key={b.id}>
            <Td className="font-medium text-gray-900">{b.studentName}</Td>
            <Td>{b.classTitle}</Td>
            <Td>{formatDate(b.date)}</Td>
            <Td>{formatTime(b.startTime)}</Td>
            <Td>
              {b.danceRole ? <StatusBadge status={b.danceRole} /> : "—"}
            </Td>
            <Td>
              <StatusBadge status={b.status} />
            </Td>
            <Td>{formatDate(b.bookedAt)}</Td>
          </tr>
        ))}
      </AdminTable>
    </div>
  );
}

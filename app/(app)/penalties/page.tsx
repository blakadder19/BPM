"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { SelectFilter } from "@/components/ui/select-filter";
import { StatusBadge } from "@/components/ui/status-badge";
import { AdminTable, Td } from "@/components/ui/admin-table";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, formatCents } from "@/lib/utils";
import { PENALTIES } from "@/lib/mock-data";

const REASON_OPTIONS = [
  { value: "late_cancel", label: "Late Cancel" },
  { value: "no_show", label: "No-show" },
];

const RESOLUTION_OPTIONS = [
  { value: "credit_deducted", label: "Resolved (credit)" },
  { value: "monetary_pending", label: "Unresolved" },
  { value: "waived", label: "Waived" },
];

export default function PenaltiesPage() {
  const [search, setSearch] = useState("");
  const [reasonFilter, setReasonFilter] = useState("");
  const [resolutionFilter, setResolutionFilter] = useState("");

  const q = search.toLowerCase();

  const filtered = PENALTIES.filter((p) => {
    if (
      q &&
      !p.studentName.toLowerCase().includes(q) &&
      !p.classTitle.toLowerCase().includes(q)
    ) {
      return false;
    }
    if (reasonFilter && p.reason !== reasonFilter) return false;
    if (resolutionFilter && p.resolution !== resolutionFilter) return false;
    return true;
  });

  const unresolvedCount = PENALTIES.filter(
    (p) => p.resolution === "monetary_pending"
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Penalties"
        description="Late cancel and no-show fees. Classes only — socials excluded."
      />

      {unresolvedCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>
            <strong>{unresolvedCount}</strong> unresolved{" "}
            {unresolvedCount === 1 ? "penalty" : "penalties"} requiring
            attention.
          </span>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="w-full sm:max-w-xs">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by student or class…"
          />
        </div>
        <SelectFilter
          value={reasonFilter}
          onChange={setReasonFilter}
          options={REASON_OPTIONS}
          placeholder="All reasons"
        />
        <SelectFilter
          value={resolutionFilter}
          onChange={setResolutionFilter}
          options={RESOLUTION_OPTIONS}
          placeholder="All statuses"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title="No penalties recorded"
          description="Penalty records will appear when students cancel late or miss classes."
        />
      ) : (
        <AdminTable
          headers={[
            "Student",
            "Class",
            "Date",
            "Reason",
            "Amount",
            "Resolution",
            "Created",
          ]}
          count={filtered.length}
        >
          {filtered.map((p) => (
            <tr
              key={p.id}
              className={
                p.resolution === "monetary_pending"
                  ? "bg-amber-50/50"
                  : undefined
              }
            >
              <Td className="font-medium text-gray-900">{p.studentName}</Td>
              <Td>{p.classTitle}</Td>
              <Td>{formatDate(p.date)}</Td>
              <Td>
                <StatusBadge status={p.reason} />
              </Td>
              <Td>{formatCents(p.amountCents)}</Td>
              <Td>
                <StatusBadge status={p.resolution} />
              </Td>
              <Td>{formatDate(p.createdAt)}</Td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}

"use client";

import { Fragment, useState } from "react";
import {
  AlertTriangle,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Pencil,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { SelectFilter } from "@/components/ui/select-filter";
import { StatusBadge } from "@/components/ui/status-badge";
import { AdminTable, Td } from "@/components/ui/admin-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { formatDate, formatCents } from "@/lib/utils";
import { PenaltyDetailPanel } from "./penalty-detail-panel";
import {
  ResolveConfirmDialog,
  WaiveConfirmDialog,
  EditNotesDialog,
} from "./penalty-dialogs";
import type { StoredPenalty } from "@/lib/services/penalty-service";

const REASON_OPTIONS = [
  { value: "late_cancel", label: "Late Cancel" },
  { value: "no_show", label: "No-show" },
];

const RESOLUTION_OPTIONS = [
  { value: "monetary_pending", label: "Unresolved" },
  { value: "credit_deducted", label: "Resolved (credit)" },
  { value: "waived", label: "Waived" },
];

const TABLE_HEADERS = [
  "",
  "Student",
  "Class",
  "Date",
  "Reason",
  "Amount",
  "Resolution",
  "Created",
  "Actions",
];

export function AdminPenalties({ penalties }: { penalties: StoredPenalty[] }) {
  const [search, setSearch] = useState("");
  const [reasonFilter, setReasonFilter] = useState("");
  const [resolutionFilter, setResolutionFilter] = useState("");

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resolveTarget, setResolveTarget] = useState<StoredPenalty | null>(null);
  const [waiveTarget, setWaiveTarget] = useState<StoredPenalty | null>(null);
  const [notesTarget, setNotesTarget] = useState<StoredPenalty | null>(null);

  const q = search.toLowerCase();

  const filtered = penalties.filter((p) => {
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

  const unresolvedCount = penalties.filter(
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
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
          title="No penalties found"
          description="Try a different search or filter, or penalty records will appear when students cancel late or miss classes."
        />
      ) : (
        <AdminTable headers={TABLE_HEADERS} count={filtered.length}>
          {filtered.map((p) => {
            const isExpanded = expandedId === p.id;
            return (
              <Fragment key={p.id}>
                <tr
                  className={`cursor-pointer hover:bg-gray-50 ${
                    p.resolution === "monetary_pending" ? "bg-amber-50/50" : ""
                  }`}
                  onClick={() => setExpandedId(isExpanded ? null : p.id)}
                >
                  <Td className="w-8">
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    )}
                  </Td>
                  <Td className="font-medium text-gray-900">{p.studentName}</Td>
                  <Td>{p.classTitle}</Td>
                  <Td>{formatDate(p.classDate)}</Td>
                  <Td>
                    <StatusBadge status={p.reason} />
                  </Td>
                  <Td>{formatCents(p.amountCents)}</Td>
                  <Td>
                    <StatusBadge status={p.resolution} />
                  </Td>
                  <Td>{formatDate(p.createdAt)}</Td>
                  <Td className="w-36">
                    <div
                      className="flex items-center gap-1.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {p.resolution === "monetary_pending" ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setResolveTarget(p)}
                            title="Mark as resolved"
                          >
                            <Check className="h-3.5 w-3.5 mr-1" />
                            Resolve
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setWaiveTarget(p)}
                            title="Waive this penalty"
                          >
                            <X className="h-3.5 w-3.5 mr-1" />
                            Waive
                          </Button>
                        </>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                      <button
                        onClick={() => setNotesTarget(p)}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        title={p.notes ? "Edit notes" : "Add notes"}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </Td>
                </tr>

                {isExpanded && (
                  <PenaltyDetailPanel
                    penalty={p}
                    colSpan={TABLE_HEADERS.length}
                    onEditNotes={() => setNotesTarget(p)}
                  />
                )}
              </Fragment>
            );
          })}
        </AdminTable>
      )}

      {resolveTarget && (
        <ResolveConfirmDialog
          penalty={resolveTarget}
          onClose={() => setResolveTarget(null)}
        />
      )}

      {waiveTarget && (
        <WaiveConfirmDialog
          penalty={waiveTarget}
          onClose={() => setWaiveTarget(null)}
        />
      )}

      {notesTarget && (
        <EditNotesDialog
          penalty={notesTarget}
          onClose={() => setNotesTarget(null)}
        />
      )}
    </div>
  );
}

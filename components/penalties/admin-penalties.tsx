"use client";

import { Fragment, useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  RefreshCw,
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
  ReopenConfirmDialog,
  EditNotesDialog,
  AddPenaltyDialog,
  DeleteConfirmDialog,
  type StudentOption,
  type ClassOption,
  type PenaltyFees,
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

interface AdminPenaltiesProps {
  penalties: StoredPenalty[];
  students: StudentOption[];
  classes: ClassOption[];
  penaltyFees: PenaltyFees;
  isDev?: boolean;
  initialSearch?: string;
  initialStudentFilter?: string;
}

export function AdminPenalties({ penalties, students, classes, penaltyFees, isDev, initialSearch, initialStudentFilter }: AdminPenaltiesProps) {
  const router = useRouter();
  const [search, setSearch] = useState(initialSearch ?? "");
  const [reasonFilter, setReasonFilter] = useState("");
  const [resolutionFilter, setResolutionFilter] = useState("");
  const [studentFilter, setStudentFilter] = useState(initialStudentFilter ?? "");

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resolveTarget, setResolveTarget] = useState<StoredPenalty | null>(null);
  const [waiveTarget, setWaiveTarget] = useState<StoredPenalty | null>(null);
  const [reopenTarget, setReopenTarget] = useState<StoredPenalty | null>(null);
  const [notesTarget, setNotesTarget] = useState<StoredPenalty | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StoredPenalty | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [backfillPending, startBackfill] = useTransition();
  const [backfillResult, setBackfillResult] = useState<string | null>(null);
  const [clearPending, startClear] = useTransition();
  const [clearResult, setClearResult] = useState<string | null>(null);

  const q = search.toLowerCase();

  const studentFilterOptions = useMemo(() => {
    const names = Array.from(new Set(penalties.map((p) => p.studentName))).sort();
    return names.map((n) => ({ value: n, label: n }));
  }, [penalties]);

  const filtered = penalties.filter((p) => {
    if (
      q &&
      !p.studentName.toLowerCase().includes(q) &&
      !p.classTitle.toLowerCase().includes(q)
    ) {
      return false;
    }
    if (studentFilter && p.studentName !== studentFilter) return false;
    if (reasonFilter && p.reason !== reasonFilter) return false;
    if (resolutionFilter && p.resolution !== resolutionFilter) return false;
    return true;
  });

  const unresolvedCount = penalties.filter(
    (p) => p.resolution === "monetary_pending"
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Penalties"
          description={`Late cancel ${formatCents(penaltyFees.lateCancelCents)} · No-show ${formatCents(penaltyFees.noShowCents)}. Classes only — socials excluded.`}
        />
        <div className="flex items-center gap-2">
          {isDev && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setClearResult(null);
                  startClear(async () => {
                    const { clearAllPenaltiesAction } = await import(
                      "@/lib/actions/penalties-admin"
                    );
                    const res = await clearAllPenaltiesAction();
                    setClearResult(
                      res.success
                        ? `Cleared ${res.cleared} penalties`
                        : res.error ?? "Failed"
                    );
                    router.refresh();
                  });
                }}
                disabled={clearPending}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                {clearPending ? "Clearing…" : "Clear All"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setBackfillResult(null);
                  startBackfill(async () => {
                    const { backfillPenaltiesAction } = await import(
                      "@/lib/actions/penalties-admin"
                    );
                    const res = await backfillPenaltiesAction();
                    setBackfillResult(
                      res.success
                        ? `Backfill: ${res.created} created, ${res.skipped} skipped`
                        : res.error ?? "Failed"
                    );
                    router.refresh();
                  });
                }}
                disabled={backfillPending}
              >
                <RefreshCw className={`mr-1.5 h-4 w-4 ${backfillPending ? "animate-spin" : ""}`} />
                {backfillPending ? "Backfilling…" : "Backfill Penalties"}
              </Button>
            </>
          )}
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Penalty
          </Button>
        </div>
      </div>

      {(backfillResult || clearResult) && (
        <div className="space-y-2">
          {backfillResult && (
            <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-800">
              <RefreshCw className="h-4 w-4 flex-shrink-0" />
              <span>{backfillResult}</span>
              <button
                onClick={() => setBackfillResult(null)}
                className="ml-auto text-blue-400 hover:text-blue-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {clearResult && (
            <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-800">
              <Trash2 className="h-4 w-4 flex-shrink-0" />
              <span>{clearResult}</span>
              <button
                onClick={() => setClearResult(null)}
                className="ml-auto text-blue-400 hover:text-blue-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

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
        <SelectFilter
          value={studentFilter}
          onChange={setStudentFilter}
          options={studentFilterOptions}
          placeholder="All students"
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
            const isPending = p.resolution === "monetary_pending";
            return (
              <Fragment key={p.id}>
                <tr
                  className={`cursor-pointer hover:bg-gray-50 ${
                    isPending ? "bg-amber-50/50" : ""
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
                  <Td className="w-40">
                    <div
                      className="flex items-center gap-1.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isPending ? (
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
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setReopenTarget(p)}
                          title="Reopen this penalty"
                        >
                          <RotateCcw className="h-3.5 w-3.5 mr-1" />
                          Reopen
                        </Button>
                      )}
                      <button
                        onClick={() => setNotesTarget(p)}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        title={p.notes ? "Edit notes" : "Add notes"}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {isDev && (
                        <button
                          onClick={() => setDeleteTarget(p)}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                          title="Delete (dev only)"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </Td>
                </tr>

                {isExpanded && (
                  <PenaltyDetailPanel
                    penalty={p}
                    colSpan={TABLE_HEADERS.length}
                    onResolve={() => setResolveTarget(p)}
                    onWaive={() => setWaiveTarget(p)}
                    onReopen={() => setReopenTarget(p)}
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

      {reopenTarget && (
        <ReopenConfirmDialog
          penalty={reopenTarget}
          onClose={() => setReopenTarget(null)}
        />
      )}

      {notesTarget && (
        <EditNotesDialog
          penalty={notesTarget}
          onClose={() => setNotesTarget(null)}
        />
      )}

      {showAdd && (
        <AddPenaltyDialog
          students={students}
          classes={classes}
          penaltyFees={penaltyFees}
          onClose={() => setShowAdd(false)}
        />
      )}

      {isDev && deleteTarget && (
        <DeleteConfirmDialog
          penalty={deleteTarget}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

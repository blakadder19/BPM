"use client";

import { useMemo, useState, useTransition } from "react";
import { Trash2, ShieldCheck, ShieldX, Hourglass, Plus, X, Inbox } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { SelectFilter } from "@/components/ui/select-filter";
import { AdminTable, Td } from "@/components/ui/admin-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import {
  AFFILIATION_TYPES,
  AFFILIATION_VERIFICATION_STATUSES,
  type AffiliationType,
  type AffiliationVerificationStatus,
} from "@/lib/domain/pricing-engine";
import {
  createAffiliationAction,
  updateAffiliationStatusAction,
  deleteAffiliationAction,
} from "@/lib/actions/affiliations";

interface AffiliationRow {
  id: string;
  studentId: string;
  affiliationType: AffiliationType;
  verificationStatus: AffiliationVerificationStatus;
  verifiedAt: string | null;
  verifiedBy: string | null;
  validFrom: string | null;
  validUntil: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface StudentRow {
  id: string;
  fullName: string;
  email: string | null;
}

const TYPE_LABELS: Record<AffiliationType, string> = {
  hse: "HSE",
  gardai: "Gardaí",
  language_school: "Language School",
  corporate: "Corporate",
  staff: "Staff",
  other: "Other",
};

const STATUS_LABELS: Record<AffiliationVerificationStatus, string> = {
  pending: "Pending",
  verified: "Verified",
  rejected: "Rejected",
  expired: "Expired",
};

function statusVariant(s: AffiliationVerificationStatus) {
  switch (s) {
    case "verified": return "success" as const;
    case "rejected": return "danger" as const;
    case "expired": return "neutral" as const;
    case "pending": return "warning" as const;
  }
}

interface Props {
  affiliations: AffiliationRow[];
  students: StudentRow[];
  /**
   * Map of affiliation type → count of currently ACTIVE discount rules
   * that require that affiliation. Surfaced as small chips above the
   * table so admins can see whether verifying a given affiliation type
   * actually unlocks any current discounts.
   */
  activeRulesByAffiliation?: Record<string, number>;
  /**
   * Initial value for the search box, sourced from the URL `?search=`
   * query string. Used by deep-links (e.g. from a student detail panel
   * in /students) so the table opens already filtered to that student.
   */
  initialSearch?: string;
}

export function AffiliationsClient({
  affiliations,
  students,
  activeRulesByAffiliation = {},
  initialSearch = "",
}: Props) {
  const [search, setSearch] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const studentById = useMemo(
    () => new Map(students.map((s) => [s.id, s])),
    [students],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return affiliations
      .filter((a) => {
        if (statusFilter !== "all" && a.verificationStatus !== statusFilter) return false;
        if (typeFilter !== "all" && a.affiliationType !== typeFilter) return false;
        if (!q) return true;
        const stu = studentById.get(a.studentId);
        return (
          (stu?.fullName.toLowerCase().includes(q) ?? false) ||
          (stu?.email?.toLowerCase().includes(q) ?? false) ||
          a.affiliationType.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [affiliations, search, statusFilter, typeFilter, studentById]);

  function runAction(formData: FormData, action: (fd: FormData) => Promise<{ success: boolean; error?: string }>) {
    setActionError(null);
    startTransition(async () => {
      const r = await action(formData);
      if (!r.success) setActionError(r.error ?? "Action failed");
      else setShowCreate(false);
    });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Student Affiliations"
        description="HSE, Gardaí, language school and other affiliations that may unlock discount rules. Affiliations must be verified before they can apply discounts at purchase time."
        actions={
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="size-4" />
            <span>Add affiliation</span>
          </Button>
        }
      />

      {actionError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {/* Quick visibility into what each affiliation type currently unlocks. */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
        <span className="font-medium text-gray-500">Active rules per type:</span>
        {AFFILIATION_TYPES.map((t) => {
          const count = activeRulesByAffiliation[t] ?? 0;
          return (
            <span
              key={t}
              className={
                "rounded-full border px-2 py-0.5 " +
                (count > 0
                  ? "border-bpm-200 bg-bpm-50 text-bpm-700"
                  : "border-gray-200 bg-gray-50 text-gray-500")
              }
              title={
                count > 0
                  ? `${count} active discount rule${count === 1 ? "" : "s"} require this affiliation`
                  : "No active discount rules currently require this affiliation"
              }
            >
              {TYPE_LABELS[t]} · {count}
            </span>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2">
        <div className="sm:max-w-sm sm:flex-1">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by student name, email or type"
          />
        </div>
        <SelectFilter
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "all", label: "All statuses" },
            ...AFFILIATION_VERIFICATION_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
          ]}
        />
        <SelectFilter
          value={typeFilter}
          onChange={setTypeFilter}
          options={[
            { value: "all", label: "All types" },
            ...AFFILIATION_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] })),
          ]}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No affiliations match"
          description="Adjust filters or add a new affiliation."
        />
      ) : (
        <AdminTable
          headers={["Student", "Type", "Status", "Validity", "Verified", "Actions"]}
        >
          {filtered.map((a) => {
            const stu = studentById.get(a.studentId);
            return (
              <tr key={a.id} className="border-t">
                <Td>
                  <div className="font-medium">{stu?.fullName ?? a.studentId}</div>
                  {stu?.email && <div className="text-xs text-gray-500">{stu.email}</div>}
                </Td>
                <Td>
                  <Badge>{TYPE_LABELS[a.affiliationType]}</Badge>
                </Td>
                <Td>
                  <Badge variant={statusVariant(a.verificationStatus)}>{STATUS_LABELS[a.verificationStatus]}</Badge>
                </Td>
                <Td>
                  <div className="text-xs">
                    <div>{a.validFrom ? `From ${formatDate(a.validFrom)}` : "—"}</div>
                    <div>{a.validUntil ? `To ${formatDate(a.validUntil)}` : "no end"}</div>
                  </div>
                </Td>
                <Td>
                  {a.verifiedAt ? (
                    <div className="text-xs">
                      <div>{formatDate(a.verifiedAt)}</div>
                      {a.verifiedBy && <div className="text-gray-500">by {a.verifiedBy}</div>}
                    </div>
                  ) : (
                    <span className="text-xs text-gray-500">—</span>
                  )}
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {a.verificationStatus !== "verified" && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const fd = new FormData();
                          fd.set("id", a.id);
                          fd.set("verificationStatus", "verified");
                          runAction(fd, updateAffiliationStatusAction);
                        }}
                      >
                        <Button size="sm" variant="outline">
                          <ShieldCheck className="size-3.5" />
                          <span>Verify</span>
                        </Button>
                      </form>
                    )}
                    {a.verificationStatus !== "rejected" && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const fd = new FormData();
                          fd.set("id", a.id);
                          fd.set("verificationStatus", "rejected");
                          runAction(fd, updateAffiliationStatusAction);
                        }}
                      >
                        <Button size="sm" variant="outline">
                          <ShieldX className="size-3.5" />
                          <span>Reject</span>
                        </Button>
                      </form>
                    )}
                    {a.verificationStatus !== "expired" && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const fd = new FormData();
                          fd.set("id", a.id);
                          fd.set("verificationStatus", "expired");
                          runAction(fd, updateAffiliationStatusAction);
                        }}
                      >
                        <Button size="sm" variant="outline">
                          <Hourglass className="size-3.5" />
                          <span>Expire</span>
                        </Button>
                      </form>
                    )}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!confirm("Delete this affiliation?")) return;
                        const fd = new FormData();
                        fd.set("id", a.id);
                        runAction(fd, deleteAffiliationAction);
                      }}
                    >
                      <Button size="sm" variant="ghost">
                        <Trash2 className="size-3.5 text-red-600" />
                      </Button>
                    </form>
                  </div>
                </Td>
              </tr>
            );
          })}
        </AdminTable>
      )}

      {showCreate && (
        <CreateAffiliationModal
          students={students}
          onClose={() => setShowCreate(false)}
          onSubmit={(fd) => runAction(fd, createAffiliationAction)}
        />
      )}
    </div>
  );
}

function CreateAffiliationModal({
  students,
  onClose,
  onSubmit,
}: {
  students: StudentRow[];
  onClose: () => void;
  onSubmit: (fd: FormData) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Add affiliation</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-gray-100" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            onSubmit(fd);
          }}
          className="space-y-3"
        >
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Student</span>
            <select
              name="studentId"
              required
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              defaultValue=""
            >
              <option value="" disabled>Select student…</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName}{s.email ? ` (${s.email})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Type</span>
            <select
              name="affiliationType"
              required
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              defaultValue="hse"
            >
              {AFFILIATION_TYPES.map((t) => (
                <option key={t} value={t}>{TYPE_LABELS[t]}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Verification status</span>
            <select
              name="verificationStatus"
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              defaultValue="verified"
            >
              {AFFILIATION_VERIFICATION_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Valid from</span>
              <input type="date" name="validFrom" className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Valid until</span>
              <input type="date" name="validUntil" className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Notes (optional)</span>
            <textarea name="notes" rows={2} className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Metadata (optional, key:value per line)</span>
            <textarea
              name="metadata"
              rows={3}
              placeholder="employee_id: 12345&#10;department: ED"
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm font-mono"
            />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit">Create</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

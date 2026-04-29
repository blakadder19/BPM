"use client";

import { Fragment, useState, useTransition, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown, ChevronUp, Pencil, Plus, Users, Power, Trash2, RefreshCw, UserCheck, UserX } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { AdminHelpButton } from "@/components/admin/admin-help-panel";
import { SearchInput } from "@/components/ui/search-input";
import { SelectFilter } from "@/components/ui/select-filter";
import { StatusBadge } from "@/components/ui/status-badge";
import { AdminTable, Td } from "@/components/ui/admin-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { computeMemberBenefits } from "@/lib/domain/member-benefits";
import { StudentDetailPanel } from "./student-detail-panel";
import {
  AddStudentDialog,
  EditStudentDialog,
  DeactivateConfirmDialog,
  DeleteStudentDialog,
  AddSubscriptionDialog,
  EditSubscriptionDialog,
} from "./student-dialogs";
import { runTermLifecycleAction, getLifecycleRunInfo } from "@/lib/actions/term-lifecycle";
import { qrWalkInCheckInAction } from "@/lib/actions/qr-checkin";
import type { StudentImpact } from "./student-dialogs";
import type { StudentListItem } from "@/types/domain";
import type {
  MockSubscription,
  MockTerm,
  MockWalletTx,
  MockBooking,
  MockPenalty,
  MockProduct,
  MockDanceStyle,
  MockEventPurchase,
} from "@/lib/mock-data";

const ROLE_OPTIONS = [
  { value: "leader", label: "Leader" },
  { value: "follower", label: "Follower" },
];

const ACTIVE_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const SUB_STATUS_OPTIONS = [
  { value: "has_active", label: "Has active sub" },
  { value: "no_active", label: "No active sub" },
];

const ACCOUNT_STATUS_OPTIONS = [
  { value: "claimed", label: "Claimed" },
  { value: "unclaimed", label: "Not claimed" },
];

const TABLE_HEADERS = [
  "",
  "Name",
  "Email",
  "Phone",
  "Role",
  "Status",
  "Subscription",
  "Credits",
  "Joined",
  "",
];

interface AttendanceSlice {
  bookableClassId: string;
  studentId: string;
  status: "present" | "absent" | "late" | "excused";
}

/**
 * Lightweight affiliation slice used by the student detail panel.
 *
 * Only the fields the panel renders are included — keep this list tight
 * so the /students payload stays small for academies with many
 * affiliations.
 */
export interface AffiliationSummary {
  id: string;
  studentId: string;
  affiliationType: string;
  verificationStatus: string;
  verifiedAt: string | null;
  verifiedBy: string | null;
  validFrom: string | null;
  validUntil: string | null;
  notes: string | null;
  createdAt: string;
}

interface AdminStudentsProps {
  students: StudentListItem[];
  subscriptions: MockSubscription[];
  terms: MockTerm[];
  products: MockProduct[];
  danceStyles: MockDanceStyle[];
  walletTransactions: MockWalletTx[];
  bookings: MockBooking[];
  penalties: MockPenalty[];
  eventPurchases?: MockEventPurchase[];
  attendanceRecords?: AttendanceSlice[];
  affiliations?: AffiliationSummary[];
  initialSearch?: string;
  birthdayUsedStudentIds?: string[];
  birthdayRedemptions?: Record<string, { classTitle?: string; classDate?: string }>;
}

export function AdminStudents({
  students,
  subscriptions,
  terms,
  products,
  danceStyles,
  walletTransactions,
  bookings,
  penalties,
  eventPurchases,
  attendanceRecords,
  affiliations = [],
  initialSearch,
  birthdayUsedStudentIds = [],
  birthdayRedemptions = {},
}: AdminStudentsProps) {
  const searchParams = useSearchParams();
  const birthdayUsedSet = new Set(birthdayUsedStudentIds);
  const [search, setSearch] = useState(initialSearch ?? "");
  const [roleFilter, setRoleFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [subStatusFilter, setSubStatusFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("");

  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Dialog state
  const [editStudent, setEditStudent] = useState<StudentListItem | null>(null);
  const [deactivateStudent, setDeactivateStudent] = useState<StudentListItem | null>(null);
  const [deleteStudentTarget, setDeleteStudentTarget] = useState<StudentListItem | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addSubStudentId, setAddSubStudentId] = useState<string | null>(null);
  const [editSub, setEditSub] = useState<MockSubscription | null>(null);
  const [lifecycleMsg, setLifecycleMsg] = useState<string | null>(null);
  const [lifecyclePending, startLifecycle] = useTransition();
  const [lastRunTs, setLastRunTs] = useState<string | null>(null);

  useEffect(() => {
    const highlightId = searchParams.get("highlight");
    const action = searchParams.get("action");
    if (!highlightId) return;
    const exists = students.some((s) => s.id === highlightId);
    if (!exists) return;
    setExpandedId(highlightId);
    if (action === "add-subscription") {
      setAddSubStudentId(highlightId);
    }
  }, [searchParams, students]);

  const q = search.toLowerCase();

  const activeSubStudentIds = new Set(
    subscriptions.filter((s) => s.status === "active").map((s) => s.studentId)
  );

  const filtered = students
    .filter((s) => {
      if (
        q &&
        !s.fullName.toLowerCase().includes(q) &&
        !s.email.toLowerCase().includes(q) &&
        !(s.phone && s.phone.toLowerCase().includes(q))
      ) {
        return false;
      }
      if (roleFilter && s.preferredRole !== roleFilter) return false;
      if (activeFilter === "active" && !s.isActive) return false;
      if (activeFilter === "inactive" && s.isActive) return false;
      if (subStatusFilter === "has_active" && !activeSubStudentIds.has(s.id)) return false;
      if (subStatusFilter === "no_active" && activeSubStudentIds.has(s.id)) return false;
      if (accountFilter === "claimed" && !s.authLinkedAt) return false;
      if (accountFilter === "unclaimed" && s.authLinkedAt) return false;
      return true;
    })
    .sort((a, b) => (b.joinedAt ?? "").localeCompare(a.joinedAt ?? ""));

  function deriveSubInfo(studentId: string) {
    const studentSubs = subscriptions.filter(
      (s) => s.studentId === studentId && s.status === "active"
    );
    if (studentSubs.length === 0) return { name: null, credits: "—" };
    const totalCredits = studentSubs.reduce((sum, s) => {
      if (s.remainingCredits === null) return Infinity;
      return sum === Infinity ? Infinity : sum + (s.remainingCredits ?? 0);
    }, 0 as number);
    const firstName = studentSubs[0].productName;
    const label = studentSubs.length > 1 ? `${firstName} +${studentSubs.length - 1}` : firstName;
    return {
      name: label,
      credits: totalCredits === Infinity ? "∞" : String(totalCredits),
    };
  }

  function computeStudentImpact(studentId: string): StudentImpact {
    const today = new Date().toISOString().slice(0, 10);
    return {
      activeSubscriptions: subscriptions.filter((s) => s.studentId === studentId && s.status === "active").length,
      futureBookings: bookings.filter((b) => b.studentId === studentId && b.date >= today && b.status !== "cancelled").length,
      pendingPenalties: penalties.filter((p) => p.studentId === studentId && p.resolution === "monetary_pending").length,
    };
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="Students"
          description="Student directory — click a row to expand details, or use the edit button."
        />
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <AdminHelpButton pageKey="students" />
          <Button
            variant="outline"
            size="sm"
            disabled={lifecyclePending}
            onClick={() => {
              setLifecycleMsg(null);
              startLifecycle(async () => {
                const res = await runTermLifecycleAction("manual");
                if (res.success && res.result) {
                  const r = res.result;
                  if (r.expired === 0 && r.renewalsPrepared === 0) {
                    setLifecycleMsg("All subscriptions are up to date.");
                  } else {
                    const parts: string[] = [];
                    if (r.expired > 0) parts.push(`${r.expired} expired`);
                    if (r.renewalsPrepared > 0) parts.push(`${r.renewalsPrepared} renewal${r.renewalsPrepared !== 1 ? "s" : ""} prepared`);
                    setLifecycleMsg(parts.join(", ") + ".");
                  }
                } else {
                  setLifecycleMsg(res.error ?? "Lifecycle check failed.");
                }
                const info = await getLifecycleRunInfo();
                setLastRunTs(info.lastRun);
              });
            }}
          >
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${lifecyclePending ? "animate-spin" : ""}`} />
            {lifecyclePending ? "Checking…" : "Term Lifecycle"}
          </Button>
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Student
          </Button>
        </div>
      </div>

      {lifecycleMsg && (
        <div className="rounded-lg border border-bpm-200 bg-bpm-50 px-4 py-2 text-sm text-bpm-800">
          <div className="flex items-center justify-between">
            <span>{lifecycleMsg}</span>
            <button onClick={() => setLifecycleMsg(null)} className="text-bpm-400 hover:text-bpm-600 ml-2">
              ✕
            </button>
          </div>
          {lastRunTs && (
            <p className="text-xs text-bpm-500 mt-1">
              Last full run: {new Date(lastRunTs).toLocaleString()} (manual).
              Lazy expiry also runs on page loads. Scheduled via /api/lifecycle if configured.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="w-full sm:max-w-xs">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search name, email, or phone…"
          />
        </div>
        <SelectFilter value={roleFilter} onChange={setRoleFilter} options={ROLE_OPTIONS} placeholder="All roles" />
        <SelectFilter value={activeFilter} onChange={setActiveFilter} options={ACTIVE_OPTIONS} placeholder="All statuses" />
        <SelectFilter value={subStatusFilter} onChange={setSubStatusFilter} options={SUB_STATUS_OPTIONS} placeholder="All subs" />
        <SelectFilter value={accountFilter} onChange={setAccountFilter} options={ACCOUNT_STATUS_OPTIONS} placeholder="All accounts" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No students found"
          description="Try a different search or filter."
        />
      ) : (
        <AdminTable headers={TABLE_HEADERS} count={filtered.length}>
          {filtered.map((s) => {
            const isExpanded = expandedId === s.id;
            const subInfo = deriveSubInfo(s.id);
            return (
              <Fragment key={s.id}>
                <tr
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => setExpandedId(isExpanded ? null : s.id)}
                >
                  <Td className="w-8">
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    )}
                  </Td>
                  <Td className="font-medium text-gray-900">
                    <span className="inline-flex items-center gap-1.5">
                      {s.fullName}
                      {s.authLinkedAt ? (
                        <span title={`Account claimed ${formatDate(s.authLinkedAt)}`}>
                          <UserCheck className="h-3.5 w-3.5 text-green-500 shrink-0" />
                        </span>
                      ) : (
                        <span title="Account not yet claimed">
                          <UserX className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                        </span>
                      )}
                    </span>
                  </Td>
                  <Td>{s.email}</Td>
                  <Td>{s.phone ?? "—"}</Td>
                  <Td>
                    {s.preferredRole ? <StatusBadge status={s.preferredRole} /> : "—"}
                  </Td>
                  <Td>
                    <Badge variant={s.isActive ? "success" : "default"}>
                      {s.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </Td>
                  <Td>
                    {subInfo.name ?? <span className="text-gray-400">None</span>}
                  </Td>
                  <Td>{subInfo.credits}</Td>
                  <Td>{formatDate(s.joinedAt)}</Td>
                  <Td className="w-20">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditStudent(s);
                        }}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        title="Edit student"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeactivateStudent(s);
                        }}
                        className={`rounded-lg p-1.5 ${
                          s.isActive
                            ? "text-gray-400 hover:bg-red-50 hover:text-red-600"
                            : "text-gray-400 hover:bg-green-50 hover:text-green-600"
                        }`}
                        title={s.isActive ? "Deactivate" : "Reactivate"}
                      >
                        <Power className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteStudentTarget(s);
                        }}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                        title="Delete student"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </Td>
                </tr>
                {isExpanded && (
                  <StudentDetailPanel
                    student={s}
                    subscriptions={subscriptions}
                    terms={terms}
                    products={products}
                    walletTransactions={walletTransactions}
                    bookings={bookings}
                    penalties={penalties}
                    eventPurchases={eventPurchases}
                    attendanceRecords={attendanceRecords}
                    affiliations={affiliations.filter((a) => a.studentId === s.id)}
                    benefits={computeMemberBenefits({
                      dateOfBirth: s.dateOfBirth,
                      referenceDate: new Date().toISOString().slice(0, 10),
                      subscriptions: subscriptions.filter((sub) => sub.studentId === s.id),
                      birthdayClassUsed: birthdayUsedSet.has(s.id),
                      birthdayClassTitle: birthdayRedemptions[s.id]?.classTitle,
                      birthdayClassDate: birthdayRedemptions[s.id]?.classDate,
                    })}
                    onAddSub={() => setAddSubStudentId(s.id)}
                    onEditSub={setEditSub}
                    colSpan={TABLE_HEADERS.length}
                  />
                )}
              </Fragment>
            );
          })}
        </AdminTable>
      )}

      {showAdd && <AddStudentDialog onClose={() => setShowAdd(false)} />}

      {editStudent && (
        <EditStudentDialog student={editStudent} onClose={() => setEditStudent(null)} />
      )}

      {deactivateStudent && (
        <DeactivateConfirmDialog
          student={deactivateStudent}
          impact={computeStudentImpact(deactivateStudent.id)}
          onClose={() => setDeactivateStudent(null)}
        />
      )}

      {deleteStudentTarget && (
        <DeleteStudentDialog
          student={deleteStudentTarget}
          impact={computeStudentImpact(deleteStudentTarget.id)}
          onClose={() => setDeleteStudentTarget(null)}
        />
      )}

      {addSubStudentId && (
        <AddSubscriptionDialog
          studentId={addSubStudentId}
          products={products}
          terms={terms}
          danceStyles={danceStyles}
          onClose={() => setAddSubStudentId(null)}
          recommendedStyleName={searchParams.get("style")}
          qrClassId={searchParams.get("classId")}
          onAssignedCheckIn={async (sId, cId, subId) => {
            const res = await qrWalkInCheckInAction(sId, cId, subId);
            if (res.success) {
              window.location.href = "/attendance";
            }
          }}
        />
      )}

      {editSub && (
        <EditSubscriptionDialog subscription={editSub} products={products} danceStyles={danceStyles} onClose={() => setEditSub(null)} />
      )}
    </div>
  );
}

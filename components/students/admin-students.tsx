"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronUp, Pencil, Plus, Users, Power } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { SelectFilter } from "@/components/ui/select-filter";
import { StatusBadge } from "@/components/ui/status-badge";
import { AdminTable, Td } from "@/components/ui/admin-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { computeMemberBenefits } from "@/lib/domain/member-benefits";
import { isBirthdayClassUsed } from "@/lib/services/birthday-benefit-store";
import { StudentDetailPanel } from "./student-detail-panel";
import {
  AddStudentDialog,
  EditStudentDialog,
  DeactivateConfirmDialog,
  AddSubscriptionDialog,
  EditSubscriptionDialog,
} from "./student-dialogs";
import type { StudentListItem } from "@/types/domain";
import type {
  MockSubscription,
  MockTerm,
  MockWalletTx,
  MockBooking,
  MockPenalty,
  MockProduct,
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

interface AdminStudentsProps {
  students: StudentListItem[];
  subscriptions: MockSubscription[];
  terms: MockTerm[];
  products: MockProduct[];
  walletTransactions: MockWalletTx[];
  bookings: MockBooking[];
  penalties: MockPenalty[];
  initialSearch?: string;
}

export function AdminStudents({
  students,
  subscriptions,
  terms,
  products,
  walletTransactions,
  bookings,
  penalties,
  initialSearch,
}: AdminStudentsProps) {
  const [search, setSearch] = useState(initialSearch ?? "");
  const [roleFilter, setRoleFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [subStatusFilter, setSubStatusFilter] = useState("");

  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Dialog state
  const [editStudent, setEditStudent] = useState<StudentListItem | null>(null);
  const [deactivateStudent, setDeactivateStudent] = useState<StudentListItem | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addSubStudentId, setAddSubStudentId] = useState<string | null>(null);
  const [editSub, setEditSub] = useState<MockSubscription | null>(null);

  const q = search.toLowerCase();

  const activeSubStudentIds = new Set(
    subscriptions.filter((s) => s.status === "active").map((s) => s.studentId)
  );

  const filtered = students.filter((s) => {
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
    return true;
  });

  function deriveSubInfo(studentId: string) {
    const activeSub = subscriptions.find(
      (s) => s.studentId === studentId && s.status === "active"
    );
    return {
      name: activeSub?.productName ?? null,
      credits: activeSub
        ? activeSub.remainingCredits === null
          ? "∞"
          : String(activeSub.remainingCredits)
        : "—",
    };
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Students"
          description="Student directory — click a row to expand details, or use the edit button."
        />
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add Student
        </Button>
      </div>

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
                  <Td className="font-medium text-gray-900">{s.fullName}</Td>
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
                    </div>
                  </Td>
                </tr>
                {isExpanded && (
                  <StudentDetailPanel
                    student={s}
                    subscriptions={subscriptions}
                    terms={terms}
                    walletTransactions={walletTransactions}
                    bookings={bookings}
                    penalties={penalties}
                    benefits={computeMemberBenefits({
                      dateOfBirth: s.dateOfBirth,
                      referenceDate: new Date().toISOString().slice(0, 10),
                      subscriptions: subscriptions.filter((sub) => sub.studentId === s.id),
                      birthdayClassUsed: isBirthdayClassUsed(s.id, new Date().getFullYear()),
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
          onClose={() => setDeactivateStudent(null)}
        />
      )}

      {addSubStudentId && (
        <AddSubscriptionDialog
          studentId={addSubStudentId}
          products={products}
          terms={terms}
          onClose={() => setAddSubStudentId(null)}
        />
      )}

      {editSub && (
        <EditSubscriptionDialog subscription={editSub} onClose={() => setEditSub(null)} />
      )}
    </div>
  );
}

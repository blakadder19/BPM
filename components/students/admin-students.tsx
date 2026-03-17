"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Pencil, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { SelectFilter } from "@/components/ui/select-filter";
import { StatusBadge } from "@/components/ui/status-badge";
import { AdminTable, Td } from "@/components/ui/admin-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils";
import { getAccessRule, describeAccess } from "@/config/product-access";
import { updateStudentAction } from "@/lib/actions/students";
import type { StudentListItem } from "@/types/domain";
import type { MockSubscription, MockWalletTx } from "@/lib/mock-data";

const ROLE_OPTIONS = [
  { value: "leader", label: "Leader" },
  { value: "follower", label: "Follower" },
];

interface AdminStudentsProps {
  students: StudentListItem[];
  subscriptions: MockSubscription[];
  walletTransactions: MockWalletTx[];
}

export function AdminStudents({
  students,
  subscriptions,
  walletTransactions,
}: AdminStudentsProps) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editStudent, setEditStudent] = useState<StudentListItem | null>(null);

  const q = search.toLowerCase();

  const filtered = students.filter((s) => {
    if (
      q &&
      !s.fullName.toLowerCase().includes(q) &&
      !s.email.toLowerCase().includes(q)
    ) {
      return false;
    }
    if (roleFilter && s.preferredRole !== roleFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Students"
        description="Student directory — click a row to inspect subscriptions, or use the edit button."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="w-full sm:max-w-xs">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by name or email…"
          />
        </div>
        <SelectFilter
          value={roleFilter}
          onChange={setRoleFilter}
          options={ROLE_OPTIONS}
          placeholder="All roles"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No students found"
          description="Try a different search or filter."
        />
      ) : (
        <AdminTable
          headers={[
            "",
            "Name",
            "Email",
            "Phone",
            "Preferred Role",
            "Subscription",
            "Credits",
            "Joined",
            "",
          ]}
          count={filtered.length}
        >
          {filtered.map((s) => {
            const isExpanded = expandedId === s.id;
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
                    {s.preferredRole ? (
                      <StatusBadge status={s.preferredRole} />
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td>
                    {s.subscriptionName ?? (
                      <span className="text-gray-400">None</span>
                    )}
                  </Td>
                  <Td>
                    {s.subscriptionName === null
                      ? "—"
                      : s.remainingCredits === null
                        ? "∞"
                        : s.remainingCredits}
                  </Td>
                  <Td>{formatDate(s.joinedAt)}</Td>
                  <Td className="w-10">
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
                  </Td>
                </tr>
                {isExpanded && (
                  <SubscriptionDetailRow
                    studentId={s.id}
                    subscriptions={subscriptions}
                    walletTransactions={walletTransactions}
                  />
                )}
              </Fragment>
            );
          })}
        </AdminTable>
      )}

      {editStudent && (
        <EditStudentDialog
          student={editStudent}
          onClose={() => setEditStudent(null)}
        />
      )}
    </div>
  );
}

function SubscriptionDetailRow({
  studentId,
  subscriptions,
  walletTransactions,
}: {
  studentId: string;
  subscriptions: MockSubscription[];
  walletTransactions: MockWalletTx[];
}) {
  const subs = subscriptions.filter((s) => s.studentId === studentId);
  const txs = walletTransactions
    .filter((tx) => tx.studentId === studentId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);

  if (subs.length === 0 && txs.length === 0) {
    return (
      <tr>
        <td colSpan={9} className="bg-gray-50 px-8 py-4">
          <p className="text-sm text-gray-500">
            No active subscriptions or recent transactions.
          </p>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td colSpan={9} className="bg-gray-50 p-0">
        <div className="px-8 py-4 space-y-4">
          {subs.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                Subscriptions
              </h4>
              <div className="space-y-2">
                {subs.map((sub) => {
                  const rule = getAccessRule(sub.productId);
                  return (
                    <div
                      key={sub.id}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm"
                    >
                      <span className="font-medium text-gray-900">
                        {sub.productName}
                      </span>
                      <StatusBadge status={sub.status} />
                      <span className="text-gray-500">
                        Credits:{" "}
                        {sub.remainingCredits === null
                          ? "∞"
                          : `${sub.remainingCredits}${sub.totalCredits !== null ? ` / ${sub.totalCredits}` : ""}`}
                      </span>
                      <span className="text-gray-500">
                        Valid: {formatDate(sub.validFrom)}
                        {sub.validUntil
                          ? ` → ${formatDate(sub.validUntil)}`
                          : ""}
                      </span>
                      {sub.selectedStyleName && (
                        <span className="text-gray-500">
                          Style: {sub.selectedStyleName}
                        </span>
                      )}
                      {sub.selectedStyleNames &&
                        sub.selectedStyleNames.length > 0 && (
                          <span className="text-gray-500">
                            Styles: {sub.selectedStyleNames.join(", ")}
                          </span>
                        )}
                      {rule && (
                        <span className="text-xs text-gray-400">
                          {describeAccess(rule)}
                        </span>
                      )}
                      {rule?.isProvisional && (
                        <StatusBadge status="provisional" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {txs.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                Recent Transactions
              </h4>
              <div className="space-y-1">
                {txs.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center gap-3 text-xs text-gray-600"
                  >
                    <span
                      className={
                        tx.credits < 0 ? "text-red-600" : "text-green-600"
                      }
                    >
                      {tx.credits > 0 ? "+" : ""}
                      {tx.credits}
                    </span>
                    <span className="flex-1 truncate">{tx.description}</span>
                    <span className="text-gray-400 whitespace-nowrap">
                      {formatDate(tx.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

function EditStudentDialog({
  student,
  onClose,
}: {
  student: StudentListItem;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateStudentAction(formData);
      if (result.success) {
        router.refresh();
        onClose();
      } else {
        setError(result.error ?? "Failed to save");
      }
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Student</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <input type="hidden" name="id" value={student.id} />
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                name="fullName"
                defaultValue={student.fullName}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={student.email}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                name="phone"
                defaultValue={student.phone ?? ""}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="preferredRole">Preferred Role</Label>
              <select
                id="preferredRole"
                name="preferredRole"
                defaultValue={student.preferredRole ?? ""}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              >
                <option value="">None</option>
                <option value="leader">Leader</option>
                <option value="follower">Follower</option>
              </select>
            </div>
            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

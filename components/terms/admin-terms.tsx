"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, CalendarRange, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { AdminTable, Td } from "@/components/ui/admin-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { deriveTermStatus, getTermWeekNumber } from "@/lib/domain/term-rules";
import { AddTermDialog, EditTermDialog } from "./term-dialogs";
import type { MockTerm } from "@/lib/mock-data";

const TABLE_HEADERS = ["Name", "Start", "End", "Status", "Week #", ""];

interface AdminTermsProps {
  terms: MockTerm[];
  today: string;
}

export function AdminTerms({ terms, today }: AdminTermsProps) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [editTerm, setEditTerm] = useState<MockTerm | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MockTerm | null>(null);
  const [delPending, startDel] = useTransition();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Terms"
          description="Academy terms define the commercial cycle for memberships and passes."
        />
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add Term
        </Button>
      </div>

      {terms.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="No terms yet"
          description="Create your first term to get started."
        />
      ) : (
        <AdminTable headers={TABLE_HEADERS} count={terms.length}>
          {terms.map((t) => {
            const effectiveStatus = deriveTermStatus(t, today);
            const isActive = effectiveStatus === "active";
            const weekNum = isActive ? getTermWeekNumber(today, t) : null;
            return (
              <tr key={t.id} className="hover:bg-gray-50">
                <Td className="font-medium text-gray-900">{t.name}</Td>
                <Td>{formatDate(t.startDate)}</Td>
                <Td>{formatDate(t.endDate)}</Td>
                <Td>
                  <StatusBadge status={effectiveStatus} />
                </Td>
                <Td>
                  {weekNum !== null ? (
                    <span className="inline-flex items-center rounded-full bg-bpm-50 px-2 py-0.5 text-xs font-medium text-bpm-700">
                      Week {weekNum}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </Td>
                <Td className="w-20">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditTerm(t)}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      title="Edit term"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(t)}
                      className="rounded-lg p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600"
                      title="Delete term"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </Td>
              </tr>
            );
          })}
        </AdminTable>
      )}

      {showAdd && <AddTermDialog onClose={() => setShowAdd(false)} />}
      {editTerm && (
        <EditTermDialog term={editTerm} onClose={() => setEditTerm(null)} />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold">Delete Term</h3>
            <p className="mt-2 text-sm text-gray-600">
              Permanently delete <strong>{deleteTarget.name}</strong>? This cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)} disabled={delPending}>Cancel</Button>
              <Button
                variant="danger"
                size="sm"
                disabled={delPending}
                onClick={() => {
                  startDel(async () => {
                    const { deleteTermAction } = await import("@/lib/actions/terms");
                    await deleteTermAction(deleteTarget.id);
                    setDeleteTarget(null);
                    router.refresh();
                  });
                }}
              >
                {delPending ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

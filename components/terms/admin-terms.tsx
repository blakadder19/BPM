"use client";

import { useState } from "react";
import { Pencil, Plus, CalendarRange } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { AdminTable, Td } from "@/components/ui/admin-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { getTermWeekNumber } from "@/lib/domain/term-rules";
import { AddTermDialog, EditTermDialog } from "./term-dialogs";
import type { MockTerm } from "@/lib/mock-data";

const TABLE_HEADERS = ["Name", "Start", "End", "Status", "Week #", ""];

interface AdminTermsProps {
  terms: MockTerm[];
}

export function AdminTerms({ terms }: AdminTermsProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [editTerm, setEditTerm] = useState<MockTerm | null>(null);

  const today = new Date().toISOString().slice(0, 10);

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
            const isActive = t.status === "active";
            const weekNum = isActive ? getTermWeekNumber(today, t) : null;
            return (
              <tr key={t.id} className="hover:bg-gray-50">
                <Td className="font-medium text-gray-900">{t.name}</Td>
                <Td>{formatDate(t.startDate)}</Td>
                <Td>{formatDate(t.endDate)}</Td>
                <Td>
                  <StatusBadge status={t.status} />
                </Td>
                <Td>
                  {weekNum !== null ? (
                    <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                      Week {weekNum}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </Td>
                <Td className="w-12">
                  <button
                    onClick={() => setEditTerm(t)}
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    title="Edit term"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
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
    </div>
  );
}

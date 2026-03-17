"use client";

import { useState, useMemo } from "react";
import { Inbox } from "lucide-react";
import { TEACHER_PAIRS } from "@/lib/mock-data";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { AdminTable, Td } from "@/components/ui/admin-table";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";

export default function TeacherPairsPage() {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return TEACHER_PAIRS.filter((tp) => {
      if (!q) return true;
      return (
        tp.classTitle.toLowerCase().includes(q) ||
        tp.teacher1.toLowerCase().includes(q) ||
        (tp.teacher2?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [search]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teacher Pairs"
        description="Teacher assignments per class. Pairs rotate by effective date."
      />

      <div className="w-64">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by class or teacher…"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No teacher pairs found"
          description="Try adjusting your search."
        />
      ) : (
        <AdminTable
          headers={["Class", "Teacher 1", "Teacher 2", "From", "Until", "Active"]}
          count={filtered.length}
        >
          {filtered.map((tp) => (
            <tr key={tp.id} className="hover:bg-gray-50">
              <Td className="font-medium text-gray-900">{tp.classTitle}</Td>
              <Td>{tp.teacher1}</Td>
              <Td>
                {tp.teacher2 ? (
                  tp.teacher2
                ) : (
                  <span className="text-gray-400">Solo</span>
                )}
              </Td>
              <Td>{formatDate(tp.effectiveFrom)}</Td>
              <Td>
                {tp.effectiveUntil ? (
                  formatDate(tp.effectiveUntil)
                ) : (
                  <span className="text-gray-400">Ongoing</span>
                )}
              </Td>
              <Td>
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full ${
                    tp.isActive ? "bg-green-500" : "bg-gray-300"
                  }`}
                />
              </Td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}

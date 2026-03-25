"use client";

import { useState, useMemo, useTransition, Fragment } from "react";
import { useRouter } from "next/navigation";
import {
  Inbox, Plus, ChevronDown, ChevronUp, Pencil, Power,
  Trash2, XCircle,
} from "lucide-react";
import type { MockTeacherPair, MockClass } from "@/lib/mock-data";
import type { Teacher } from "@/lib/services/teacher-roster-store";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { SelectFilter } from "@/components/ui/select-filter";
import { AdminTable, Td } from "@/components/ui/admin-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import {
  AddTeacherDialog,
  EditTeacherDialog,
  AddAssignmentDialog,
  EditAssignmentDialog,
} from "./teacher-dialogs";

const ACTIVE_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

interface AdminTeachersProps {
  teacherRoster: Teacher[];
  assignments: MockTeacherPair[];
  templates: MockClass[];
  teacherNameMap: Record<string, string>;
  isDev?: boolean;
}

export function AdminTeachers({
  teacherRoster,
  assignments,
  templates,
  teacherNameMap,
  isDev,
}: AdminTeachersProps) {
  const [activeSection, setActiveSection] = useState<"roster" | "assignments">("roster");

  const sections = [
    { key: "roster" as const, label: "Teacher Roster" },
    { key: "assignments" as const, label: "Default Assignments" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teachers"
        description="Manage teacher roster and default class assignments."
      />

      <nav className="flex gap-4 border-b border-gray-200">
        {sections.map((s) => (
          <button
            key={s.key}
            onClick={() => setActiveSection(s.key)}
            className={`pb-2 text-sm font-medium transition-colors ${
              activeSection === s.key
                ? "border-b-2 border-indigo-600 text-indigo-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {s.label}
          </button>
        ))}
      </nav>

      {activeSection === "roster" && <RosterSection roster={teacherRoster} />}
      {activeSection === "assignments" && (
        <AssignmentsSection
          assignments={assignments}
          templates={templates}
          teacherRoster={teacherRoster}
          teacherNameMap={teacherNameMap}
          isDev={isDev}
        />
      )}
    </div>
  );
}

// ── Roster Section ──────────────────────────────────────────

function RosterSection({ roster }: { roster: Teacher[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<Teacher | null>(null);
  const [togglePending, startToggle] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<Teacher | null>(null);
  const [delPending, startDel] = useTransition();

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return roster.filter((t) => {
      if (q && !t.fullName.toLowerCase().includes(q) && !(t.email?.toLowerCase().includes(q))) {
        return false;
      }
      if (activeFilter === "active" && !t.isActive) return false;
      if (activeFilter === "inactive" && t.isActive) return false;
      return true;
    });
  }, [roster, search, activeFilter]);

  function handleToggleActive(id: string) {
    startToggle(async () => {
      const { toggleTeacherActiveAction } = await import("@/lib/actions/classes");
      await toggleTeacherActiveAction(id);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-64">
            <SearchInput value={search} onChange={setSearch} placeholder="Search by name or email…" />
          </div>
          <SelectFilter value={activeFilter} onChange={setActiveFilter} options={ACTIVE_OPTIONS} placeholder="All Status" />
        </div>
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add Teacher
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No teachers found"
          description="Add a teacher to get started."
          action={<Button onClick={() => setShowAdd(true)}><Plus className="mr-1.5 h-4 w-4" />Add Teacher</Button>}
        />
      ) : (
        <AdminTable headers={["Name", "Email", "Phone", "Active", ""]} count={filtered.length}>
          {filtered.map((t) => {
            const isExpanded = expandedId === t.id;
            return (
              <Fragment key={t.id}>
                <tr className="cursor-pointer hover:bg-gray-50" onClick={() => setExpandedId(isExpanded ? null : t.id)}>
                  <Td className="font-medium text-gray-900">{t.fullName}</Td>
                  <Td>{t.email ?? <span className="text-gray-400">—</span>}</Td>
                  <Td>{t.phone ?? <span className="text-gray-400">—</span>}</Td>
                  <Td>
                    <span className={`inline-block h-2.5 w-2.5 rounded-full ${t.isActive ? "bg-green-500" : "bg-gray-300"}`} />
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setEditTarget(t)} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600" title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => handleToggleActive(t.id)} disabled={togglePending} className={`rounded p-1.5 hover:bg-gray-100 ${t.isActive ? "text-amber-500 hover:text-amber-600" : "text-green-500 hover:text-green-600"}`} title={t.isActive ? "Deactivate" : "Reactivate"}>
                        <Power className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setDeleteTarget(t)} className="rounded p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600" title="Delete teacher">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-gray-400" /> : <ChevronDown className="h-3.5 w-3.5 text-gray-400" />}
                    </div>
                  </Td>
                </tr>
                {isExpanded && (
                  <tr>
                    <td colSpan={5} className="bg-gray-50 px-6 py-4">
                      <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                        <Detail label="Full Name" value={t.fullName} />
                        <Detail label="Email" value={t.email ?? "—"} />
                        <Detail label="Phone" value={t.phone ?? "—"} />
                        <Detail label="Active" value={t.isActive ? "Yes" : "No"} />
                        {t.notes && <Detail label="Notes" value={t.notes} />}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </AdminTable>
      )}

      {showAdd && <AddTeacherDialog onClose={() => setShowAdd(false)} />}
      {editTarget && <EditTeacherDialog teacher={editTarget} onClose={() => setEditTarget(null)} />}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold">Delete Teacher</h3>
            <p className="mt-2 text-sm text-gray-600">
              Permanently delete <strong>{deleteTarget.fullName}</strong>? This only removes the in-memory record and will not survive a server restart regardless.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)} disabled={delPending}>Cancel</Button>
              <Button
                variant="danger"
                size="sm"
                disabled={delPending}
                onClick={() => {
                  startDel(async () => {
                    const { deleteTeacherAction } = await import("@/lib/actions/classes");
                    await deleteTeacherAction(deleteTarget.id);
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

// ── Assignments Section ─────────────────────────────────────

function AssignmentsSection({
  assignments,
  templates,
  teacherRoster,
  teacherNameMap,
  isDev,
}: {
  assignments: MockTeacherPair[];
  templates: MockClass[];
  teacherRoster: Teacher[];
  teacherNameMap: Record<string, string>;
  isDev?: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [expandedClassId, setExpandedClassId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<MockTeacherPair | null>(null);
  const [togglePending, startToggle] = useTransition();
  const [deletePending, startDelete] = useTransition();
  const [clearPending, startClear] = useTransition();
  const [clearResult, setClearResult] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const resolve = (id: string | null) => (id ? teacherNameMap[id] ?? null : null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return assignments.filter((tp) => {
      const t1Name = resolve(tp.teacher1Id)?.toLowerCase() ?? "";
      const t2Name = resolve(tp.teacher2Id)?.toLowerCase() ?? "";
      if (q && !tp.classTitle.toLowerCase().includes(q) && !t1Name.includes(q) && !t2Name.includes(q)) {
        return false;
      }
      if (activeFilter === "active" && !tp.isActive) return false;
      if (activeFilter === "inactive" && tp.isActive) return false;
      return true;
    });
  }, [assignments, search, activeFilter, teacherNameMap]);

  const groupedByClass = useMemo(() => {
    const map = new Map<string, MockTeacherPair[]>();
    for (const tp of assignments) {
      const list = map.get(tp.classId) ?? [];
      list.push(tp);
      map.set(tp.classId, list);
    }
    return map;
  }, [assignments]);

  function handleToggleActive(id: string) {
    startToggle(async () => {
      const { toggleAssignmentActiveAction } = await import("@/lib/actions/classes");
      await toggleAssignmentActiveAction(id);
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    setConfirmDeleteId(null);
    startDelete(async () => {
      const { deleteAssignmentAction } = await import("@/lib/actions/classes");
      await deleteAssignmentAction(id);
      router.refresh();
    });
  }

  function handleClearAll() {
    startClear(async () => {
      const { clearAssignmentsAction } = await import("@/lib/actions/classes");
      const res = await clearAssignmentsAction();
      if (res.success) {
        setClearResult(`Cleared ${res.cleared} assignment${res.cleared !== 1 ? "s" : ""}.`);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-64">
            <SearchInput value={search} onChange={setSearch} placeholder="Search by class or teacher…" />
          </div>
          <SelectFilter value={activeFilter} onChange={setActiveFilter} options={ACTIVE_OPTIONS} placeholder="All Status" />
        </div>
        <div className="flex items-center gap-2">
          {isDev && (
            <Button variant="outline" size="sm" onClick={handleClearAll} disabled={clearPending}>
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              {clearPending ? "Clearing…" : "Clear All"}
            </Button>
          )}
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Assignment
          </Button>
        </div>
      </div>

      {clearResult && (
        <div className="flex items-center justify-between rounded-lg bg-blue-50 px-4 py-2 text-sm text-blue-700">
          {clearResult}
          <button onClick={() => setClearResult(null)} className="ml-2 text-blue-400 hover:text-blue-600">
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No assignments found"
          description="Add a default teacher assignment for a class template."
          action={<Button onClick={() => setShowAdd(true)}><Plus className="mr-1.5 h-4 w-4" />Add Assignment</Button>}
        />
      ) : (
        <AdminTable
          headers={["Class", "Teacher 1", "Teacher 2", "From", "Until", "Active", ""]}
          count={filtered.length}
        >
          {filtered.map((tp) => {
            const isExpanded = expandedClassId === tp.id;
            const classHistory = groupedByClass.get(tp.classId) ?? [];

            return (
              <Fragment key={tp.id}>
                <tr className="cursor-pointer hover:bg-gray-50" onClick={() => setExpandedClassId(isExpanded ? null : tp.id)}>
                  <Td className="font-medium text-gray-900">{tp.classTitle}</Td>
                  <Td>{resolve(tp.teacher1Id) ?? <span className="text-gray-400">—</span>}</Td>
                  <Td>{resolve(tp.teacher2Id) ?? <span className="text-gray-400">Solo</span>}</Td>
                  <Td>{formatDate(tp.effectiveFrom)}</Td>
                  <Td>{tp.effectiveUntil ? formatDate(tp.effectiveUntil) : <span className="text-gray-400">Ongoing</span>}</Td>
                  <Td>
                    <span className={`inline-block h-2.5 w-2.5 rounded-full ${tp.isActive ? "bg-green-500" : "bg-gray-300"}`} />
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setEditTarget(tp)} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600" title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => handleToggleActive(tp.id)} disabled={togglePending} className={`rounded p-1.5 hover:bg-gray-100 ${tp.isActive ? "text-amber-500 hover:text-amber-600" : "text-green-500 hover:text-green-600"}`} title={tp.isActive ? "Deactivate" : "Reactivate"}>
                        <Power className="h-3.5 w-3.5" />
                      </button>
                      {confirmDeleteId === tp.id ? (
                        <span className="flex items-center gap-1">
                          <button onClick={() => handleDelete(tp.id)} disabled={deletePending} className="rounded bg-red-500 px-2 py-0.5 text-xs font-medium text-white hover:bg-red-600">
                            Confirm
                          </button>
                          <button onClick={() => setConfirmDeleteId(null)} className="text-xs text-gray-400 hover:text-gray-600">
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button onClick={() => setConfirmDeleteId(tp.id)} className="rounded p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600" title="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {classHistory.length > 1 && (
                        isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-gray-400" /> : <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                      )}
                    </div>
                  </Td>
                </tr>
                {isExpanded && classHistory.length > 1 && (
                  <tr>
                    <td colSpan={7} className="bg-gray-50 px-6 py-3">
                      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                        Assignment History for {tp.classTitle} ({classHistory.length} records)
                      </h4>
                      <div className="space-y-1">
                        {classHistory
                          .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
                          .map((h) => (
                            <div key={h.id} className={`flex items-center gap-4 rounded px-2 py-1 text-sm ${h.id === tp.id ? "bg-indigo-50 font-medium" : ""}`}>
                              <span className="w-40">
                                {resolve(h.teacher1Id) ?? "No teacher assigned"}
                                {h.teacher2Id ? ` & ${resolve(h.teacher2Id) ?? "Unknown"}` : " (solo)"}
                              </span>
                              <span className="text-xs text-gray-500">
                                {formatDate(h.effectiveFrom)} → {h.effectiveUntil ? formatDate(h.effectiveUntil) : "Ongoing"}
                              </span>
                              <span className={`inline-block h-2 w-2 rounded-full ${h.isActive ? "bg-green-500" : "bg-gray-300"}`} />
                            </div>
                          ))}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </AdminTable>
      )}

      {showAdd && <AddAssignmentDialog templates={templates} teacherRoster={teacherRoster} onClose={() => setShowAdd(false)} />}
      {editTarget && <EditAssignmentDialog assignment={editTarget} templates={templates} teacherRoster={teacherRoster} onClose={() => setEditTarget(null)} />}
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="w-24 shrink-0 text-xs text-gray-500">{label}</dt>
      <dd className="text-gray-700">{value}</dd>
    </div>
  );
}

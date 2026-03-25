"use client";

import { useState, useMemo, useTransition, useCallback, useEffect, Fragment } from "react";
import { useRouter } from "next/navigation";
import { Inbox, Plus, ChevronDown, ChevronUp, Pencil, Power, Trash2, AlertTriangle, Calendar, X } from "lucide-react";
import type { MockClass, MockTeacherPair } from "@/lib/mock-data";
import type { LinkedInstance } from "@/lib/actions/classes";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { SelectFilter } from "@/components/ui/select-filter";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { AdminTable, Td } from "@/components/ui/admin-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { dayName, formatTime, formatDate } from "@/lib/utils";
import {
  AddTemplateDialog,
  EditTemplateDialog,
  TemplateDetailPanel,
} from "./template-dialogs";

const DAY_OPTIONS = [
  { value: "1", label: "Mon" },
  { value: "2", label: "Tue" },
  { value: "3", label: "Wed" },
  { value: "4", label: "Thu" },
  { value: "5", label: "Fri" },
  { value: "6", label: "Sat" },
  { value: "7", label: "Sun" },
];

const TYPE_OPTIONS = [
  { value: "class", label: "Class" },
  { value: "social", label: "Social" },
  { value: "student_practice", label: "Practice" },
];

const ACTIVE_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

interface StyleOption { id: string; name: string; }

interface SettingsFlags {
  roleBalancedStyleNames: string[];
  socialsBookable: boolean;
  weeklyEventsBookable: boolean;
  studentPracticeBookable: boolean;
}

interface TermOption {
  id: string;
  name: string;
  startDate?: string;
  endDate?: string;
}

interface AdminTemplatesProps {
  templates: MockClass[];
  allStyles: StyleOption[];
  allTerms?: TermOption[];
  settings: SettingsFlags;
  teacherAssignments: MockTeacherPair[];
  teacherNameMap: Record<string, string>;
  isDev?: boolean;
}

export function AdminTemplates({
  templates,
  allStyles,
  allTerms,
  settings,
  teacherAssignments,
  teacherNameMap,
  isDev,
}: AdminTemplatesProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [dayFilter, setDayFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [styleFilter, setStyleFilter] = useState("");

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<MockClass | null>(null);
  const [togglePending, startToggle] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<MockClass | null>(null);

  const styleOptions = useMemo(
    () => allStyles.map((s) => ({ value: s.name, label: s.name })),
    [allStyles]
  );

  const resolve = (id: string | null) => (id ? teacherNameMap[id] ?? null : null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return templates.filter((c) => {
      if (
        q &&
        !c.title.toLowerCase().includes(q) &&
        !(c.styleName?.toLowerCase().includes(q)) &&
        !(c.level?.toLowerCase().includes(q)) &&
        !c.location.toLowerCase().includes(q)
      ) {
        return false;
      }
      if (dayFilter && c.dayOfWeek !== Number(dayFilter)) return false;
      if (typeFilter && c.classType !== typeFilter) return false;
      if (activeFilter === "active" && !c.isActive) return false;
      if (activeFilter === "inactive" && c.isActive) return false;
      if (styleFilter && c.styleName !== styleFilter) return false;
      return true;
    });
  }, [templates, search, dayFilter, typeFilter, activeFilter, styleFilter]);

  function handleToggleActive(id: string) {
    startToggle(async () => {
      const { toggleTemplateActiveAction } = await import("@/lib/actions/classes");
      await toggleTemplateActiveAction(id);
      router.refresh();
    });
  }

  const roleBalancedSet = new Set(settings.roleBalancedStyleNames ?? []);

  function teacherSummary(classId: string): string {
    const active = teacherAssignments.find((a) => a.classId === classId && a.isActive);
    if (!active) return "—";
    const t1 = resolve(active.teacher1Id) ?? "?";
    const t2 = resolve(active.teacher2Id);
    return t2 ? `${t1} & ${t2}` : t1;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Class Templates"
          description="Weekly recurring class definitions. Settings-aware badges show role balance and bookability."
        />
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add Template
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-64">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search title, style, level, location…"
          />
        </div>
        <SelectFilter value={dayFilter} onChange={setDayFilter} options={DAY_OPTIONS} placeholder="All Days" />
        <SelectFilter value={typeFilter} onChange={setTypeFilter} options={TYPE_OPTIONS} placeholder="All Types" />
        <SelectFilter value={activeFilter} onChange={setActiveFilter} options={ACTIVE_OPTIONS} placeholder="All Status" />
        <SelectFilter value={styleFilter} onChange={setStyleFilter} options={styleOptions} placeholder="All Styles" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No templates found"
          description="Try adjusting your search or filters, or add a new template."
          action={
            <Button onClick={() => setShowAdd(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add Template
            </Button>
          }
        />
      ) : (
        <AdminTable
          headers={["Title", "Type", "Style", "Level", "Day", "Time", "Teachers", "Capacity", "Active", ""]}
          count={filtered.length}
        >
          {filtered.map((c) => {
            const isRoleBalanced = c.styleName != null && roleBalancedSet.has(c.styleName);
            const isExpanded = expandedId === c.id;

            return (
              <Fragment key={c.id}>
                <tr
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => setExpandedId(isExpanded ? null : c.id)}
                >
                  <Td className="font-medium text-gray-900">{c.title}</Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <StatusBadge status={c.classType} />
                      {c.classType === "social" && !settings.socialsBookable && (
                        <Badge variant="warning">Not Bookable</Badge>
                      )}
                      {c.classType === "student_practice" && !settings.studentPracticeBookable && (
                        <Badge variant="warning">Provisional</Badge>
                      )}
                    </div>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      {c.styleName ?? "—"}
                      {isRoleBalanced && <Badge variant="info">RB</Badge>}
                    </div>
                  </Td>
                  <Td>{c.level ?? "—"}</Td>
                  <Td>{dayName(c.dayOfWeek)}</Td>
                  <Td>{formatTime(c.startTime)} – {formatTime(c.endTime)}</Td>
                  <Td>
                    <span className="text-sm text-gray-600">{teacherSummary(c.id)}</span>
                  </Td>
                  <Td>
                    {c.leaderCap != null && c.followerCap != null
                      ? `${c.leaderCap}L / ${c.followerCap}F`
                      : c.maxCapacity != null
                        ? String(c.maxCapacity)
                        : "—"}
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`inline-block h-2.5 w-2.5 rounded-full ${c.isActive ? "bg-green-500" : "bg-gray-300"}`}
                      />
                      {!c.isActive && (
                        <span className="text-[10px] text-gray-400">Not used for generation</span>
                      )}
                    </div>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setEditTarget(c)}
                        className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleToggleActive(c.id)}
                        disabled={togglePending}
                        className={`rounded p-1.5 hover:bg-gray-100 ${
                          c.isActive ? "text-amber-500 hover:text-amber-600" : "text-green-500 hover:text-green-600"
                        }`}
                        title={c.isActive ? "Deactivate" : "Reactivate"}
                      >
                        <Power className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(c)}
                        className="rounded p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600"
                        title="Delete template"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      {isExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5 text-gray-400" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                      )}
                    </div>
                  </Td>
                </tr>
                {isExpanded && (
                  <TemplateDetailPanel
                    template={c}
                    settings={settings}
                    assignments={teacherAssignments
                      .filter((a) => a.classId === c.id)
                      .map((a) => ({
                        teacher1Name: resolve(a.teacher1Id) ?? "No teacher assigned",
                        teacher2Name: resolve(a.teacher2Id),
                        effectiveFrom: a.effectiveFrom,
                      }))}
                    allTerms={allTerms}
                  />
                )}
              </Fragment>
            );
          })}
        </AdminTable>
      )}

      {showAdd && (
        <AddTemplateDialog allStyles={allStyles} allTerms={allTerms} onClose={() => setShowAdd(false)} />
      )}
      {editTarget && (
        <EditTemplateDialog template={editTarget} allStyles={allStyles} allTerms={allTerms} onClose={() => setEditTarget(null)} />
      )}

      {deleteTarget && (
        <DeleteTemplateModal
          template={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => { setDeleteTarget(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

// ── Delete Template Modal ──────────────────────────────────

function DeleteTemplateModal({
  template,
  onClose,
  onDeleted,
}: {
  template: MockClass;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [upcoming, setUpcoming] = useState<LinkedInstance[]>([]);
  const [past, setPast] = useState<LinkedInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionPending, startAction] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const loadInstances = useCallback(async () => {
    setLoading(true);
    const { getLinkedInstancesAction } = await import("@/lib/actions/classes");
    const data = await getLinkedInstancesAction(template.id);
    setUpcoming(data.upcoming);
    setPast(data.past);
    setSelected(new Set());
    setLoading(false);
  }, [template.id]);

  useEffect(() => { loadInstances(); }, [loadInstances]);

  const totalLinked = upcoming.length + past.length;
  const canDelete = totalLinked === 0 && !loading;

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === upcoming.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(upcoming.map((i) => i.id)));
    }
  }

  function handleDeleteInstances(ids: string[]) {
    startAction(async () => {
      const { deleteInstanceAction } = await import("@/lib/actions/classes");
      for (const instId of ids) {
        await deleteInstanceAction(instId);
      }
      await loadInstances();
    });
  }

  function handleCancelInstances(ids: string[]) {
    startAction(async () => {
      const { updateInstanceStatusAction } = await import("@/lib/actions/classes");
      for (const instId of ids) {
        await updateInstanceStatusAction(instId, "cancelled");
      }
      await loadInstances();
    });
  }

  function handleDeleteTemplate() {
    startAction(async () => {
      const { deleteTemplateAction } = await import("@/lib/actions/classes");
      const result = await deleteTemplateAction(template.id);
      if (!result.success) {
        setDeleteError(result.error ?? "Unknown error");
        await loadInstances();
        return;
      }
      onDeleted();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
            <h3 className="text-lg font-semibold">Delete Template</h3>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading ? (
            <p className="text-sm text-gray-500">Loading linked instances…</p>
          ) : canDelete ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                No linked schedule instances remain. <strong>{template.title}</strong> can now be permanently deleted.
              </p>
              <p className="text-xs text-gray-400">This will also remove any teacher assignments for this template.</p>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                <div className="text-sm text-amber-800">
                  <strong>{template.title}</strong> has {totalLinked} linked schedule instance{totalLinked > 1 ? "s" : ""}.
                  Remove or cancel all instances before deleting the template.
                </div>
              </div>

              {upcoming.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-gray-700">
                      Upcoming ({upcoming.length})
                    </h4>
                    {upcoming.length > 1 && (
                      <button
                        onClick={toggleSelectAll}
                        className="text-xs text-indigo-600 hover:text-indigo-800"
                      >
                        {selected.size === upcoming.length ? "Deselect all" : "Select all"}
                      </button>
                    )}
                  </div>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {upcoming.map((inst) => (
                      <label
                        key={inst.id}
                        className={`flex items-center gap-2.5 rounded-md border px-3 py-2 text-sm cursor-pointer transition-colors ${
                          selected.has(inst.id) ? "border-indigo-300 bg-indigo-50" : "border-gray-200 bg-white hover:bg-gray-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(inst.id)}
                          onChange={() => toggleSelect(inst.id)}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <Calendar className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                        <span className="flex-1 truncate">
                          {formatDate(inst.date)} · {formatTime(inst.startTime)}–{formatTime(inst.endTime)}
                        </span>
                        <StatusBadge status={inst.status} />
                      </label>
                    ))}
                  </div>
                  {selected.size > 0 && (
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={actionPending}
                        onClick={() => handleCancelInstances(Array.from(selected))}
                      >
                        Cancel {selected.size} instance{selected.size > 1 ? "s" : ""}
                      </Button>
              <Button
                        size="sm"
                variant="danger"
                        disabled={actionPending}
                        onClick={() => handleDeleteInstances(Array.from(selected))}
                      >
                        Delete {selected.size} instance{selected.size > 1 ? "s" : ""}
              </Button>
                    </div>
                  )}
                </div>
              )}

              {past.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">
                    Past / Historical ({past.length})
                  </h4>
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {past.map((inst) => (
                      <div
                        key={inst.id}
                        className="flex items-center gap-2.5 rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-500"
                      >
                        <Calendar className="h-3.5 w-3.5 text-gray-300 flex-shrink-0" />
                        <span className="flex-1 truncate">
                          {formatDate(inst.date)} · {formatTime(inst.startTime)}–{formatTime(inst.endTime)}
                        </span>
                        <StatusBadge status={inst.status} />
                      </div>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-gray-400">
                    Past instances are historical records. Delete them individually from the Schedule page if needed.
                  </p>
                </div>
              )}
            </>
          )}

          {deleteError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-700">{deleteError}</p>
            </div>
          )}
          </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <Button variant="outline" size="sm" onClick={onClose} disabled={actionPending}>
            {canDelete ? "Cancel" : "Close"}
          </Button>
          {canDelete && (
            <Button
              variant="danger"
              size="sm"
              disabled={actionPending}
              onClick={handleDeleteTemplate}
            >
              {actionPending ? "Deleting…" : "Delete Template"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

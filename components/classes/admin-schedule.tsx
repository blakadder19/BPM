"use client";

import { useState, useMemo, useTransition, useCallback, Fragment } from "react";
import { useRouter } from "next/navigation";
import {
  Inbox, Plus, ChevronDown, ChevronUp, Pencil,
  CalendarPlus, Trash2, XCircle, Lock, Unlock, Users,
  List, Calendar, LayoutGrid,
} from "lucide-react";
import type { MockBookableClass, MockClass, MockTeacherPair } from "@/lib/mock-data";
import type { Teacher } from "@/lib/services/teacher-roster-store";
import type { PairPreset } from "@/lib/services/pair-preset-store";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { SelectFilter } from "@/components/ui/select-filter";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { AdminTable, Td } from "@/components/ui/admin-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { formatDate, formatTime } from "@/lib/utils";
import {
  AddInstanceDialog,
  EditInstanceDialog,
  GenerateScheduleDialog,
  InstanceDetailPanel,
  TeacherOverrideDialog,
} from "./schedule-dialogs";
import { ScheduleCalendar } from "./schedule-calendar";
import { RescheduleConfirmDialog } from "./reschedule-confirm-dialog";

type ViewMode = "table" | "weekly" | "monthly";

const STATUS_OPTIONS = [
  { value: "scheduled", label: "Scheduled" },
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "cancelled", label: "Cancelled" },
];

const TYPE_OPTIONS = [
  { value: "class", label: "Class" },
  { value: "social", label: "Social" },
  { value: "student_practice", label: "Practice" },
];

interface SettingsFlags {
  roleBalancedStyleNames: string[];
  socialsBookable: boolean;
  weeklyEventsBookable: boolean;
  studentPracticeBookable: boolean;
}

interface AdminScheduleProps {
  instances: MockBookableClass[];
  templates: MockClass[];
  settings: SettingsFlags;
  teacherAssignments: MockTeacherPair[];
  teacherRoster: Teacher[];
  teacherNameMap: Record<string, string>;
  pairPresets: PairPreset[];
  isDev?: boolean;
  initialSearch?: string;
}

export function AdminSchedule({
  instances,
  templates,
  settings,
  teacherAssignments,
  teacherRoster,
  teacherNameMap,
  pairPresets,
  isDev,
  initialSearch,
}: AdminScheduleProps) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [search, setSearch] = useState(initialSearch ?? "");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [styleFilter, setStyleFilter] = useState("");

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addDefaultDate, setAddDefaultDate] = useState<string | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [editTarget, setEditTarget] = useState<MockBookableClass | null>(null);
  const [overrideTarget, setOverrideTarget] = useState<MockBookableClass | null>(null);
  const [statusPending, startStatusTransition] = useTransition();
  const [clearPending, startClear] = useTransition();
  const [clearResult, setClearResult] = useState<string | null>(null);

  const [rescheduleTarget, setRescheduleTarget] = useState<{ instance: MockBookableClass; newDate: string } | null>(null);

  const resolve = (id: string | null | undefined) => (id ? teacherNameMap[id] ?? id : null);

  function resolveTeachers(bc: MockBookableClass) {
    const hasOverride = !!bc.teacherOverride1Id;
    if (hasOverride) {
      const defaultAssignment = bc.classId
        ? teacherAssignments.find((a) => a.classId === bc.classId && a.isActive)
        : null;
      const defT1 = resolve(defaultAssignment?.teacher1Id);
      const defT2 = resolve(defaultAssignment?.teacher2Id);
      const defaultSummary = defT1
        ? `${defT1}${defT2 ? ` & ${defT2}` : " (solo)"}`
        : "Unassigned";
      return {
        teacher1Name: resolve(bc.teacherOverride1Id),
        teacher2Name: resolve(bc.teacherOverride2Id),
        isOverride: true,
        defaultSummary,
      };
    }

    const defaultAssignment = bc.classId
      ? teacherAssignments.find((a) => a.classId === bc.classId && a.isActive)
      : null;
    return {
      teacher1Name: resolve(defaultAssignment?.teacher1Id) ?? null,
      teacher2Name: resolve(defaultAssignment?.teacher2Id) ?? null,
      isOverride: false,
      defaultSummary: "",
    };
  }

  const styleOptions = useMemo(() => {
    const names = new Set(instances.map((bc) => bc.styleName).filter(Boolean) as string[]);
    return Array.from(names).sort().map((n) => ({ value: n, label: n }));
  }, [instances]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return instances
      .filter((bc) => {
        if (
          q &&
          !bc.title.toLowerCase().includes(q) &&
          !(bc.styleName?.toLowerCase().includes(q)) &&
          !bc.location.toLowerCase().includes(q)
        ) return false;
        if (statusFilter && bc.status !== statusFilter) return false;
        if (typeFilter && bc.classType !== typeFilter) return false;
        if (styleFilter && bc.styleName !== styleFilter) return false;
        return true;
      })
      .sort((a, b) => {
        const dc = a.date.localeCompare(b.date);
        return dc !== 0 ? dc : a.startTime.localeCompare(b.startTime);
      });
  }, [instances, search, statusFilter, typeFilter, styleFilter]);

  function handleStatusChange(id: string, status: string) {
    startStatusTransition(async () => {
      const { updateInstanceStatusAction } = await import("@/lib/actions/classes");
      await updateInstanceStatusAction(id, status as "scheduled" | "open" | "closed" | "cancelled");
      router.refresh();
    });
  }

  function handleClearSchedule() {
    startClear(async () => {
      const { clearScheduleAction } = await import("@/lib/actions/classes");
      const res = await clearScheduleAction();
      if (res.success) {
        setClearResult(`Cleared ${res.cleared} instance${res.cleared !== 1 ? "s" : ""}.`);
        router.refresh();
      }
    });
  }

  const handleCreateFromDay = useCallback((date: string) => {
    setAddDefaultDate(date);
    setShowAdd(true);
  }, []);

  const handleReschedule = useCallback((instanceId: string, newDate: string) => {
    const inst = instances.find((bc) => bc.id === instanceId);
    if (inst && inst.date !== newDate) {
      setRescheduleTarget({ instance: inst, newDate });
    }
  }, [instances]);

  const activeTemplateCount = templates.filter((t) => t.isActive).length;
  const totalTemplateCount = templates.length;
  const roleBalancedSet = new Set(settings.roleBalancedStyleNames ?? []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Schedule"
          description="Dated class instances — generated from templates or created manually."
        />
        <div className="flex items-center gap-2">
          {isDev && (
            <>
              <Button variant="outline" size="sm" onClick={handleClearSchedule} disabled={clearPending}>
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                {clearPending ? "Clearing…" : "Clear Schedule"}
              </Button>
              <Button variant="outline" onClick={() => setShowGenerate(true)}>
                <CalendarPlus className="mr-1.5 h-4 w-4" />
                Generate Schedule
              </Button>
            </>
          )}
          <Button onClick={() => { setAddDefaultDate(null); setShowAdd(true); }}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Instance
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

      {/* View mode toggle */}
      <div className="flex items-center gap-4">
        <div className="flex rounded-lg border border-gray-200">
          <button
            onClick={() => setViewMode("table")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "table" ? "bg-indigo-50 text-indigo-700" : "text-gray-500 hover:text-gray-700"}`}
          >
            <LayoutGrid className="h-3.5 w-3.5" /> Table
          </button>
          <button
            onClick={() => setViewMode("weekly")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "weekly" ? "bg-indigo-50 text-indigo-700" : "text-gray-500 hover:text-gray-700"}`}
          >
            <List className="h-3.5 w-3.5" /> Weekly
          </button>
          <button
            onClick={() => setViewMode("monthly")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "monthly" ? "bg-indigo-50 text-indigo-700" : "text-gray-500 hover:text-gray-700"}`}
          >
            <Calendar className="h-3.5 w-3.5" /> Monthly
          </button>
        </div>

        {viewMode === "table" && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-64">
              <SearchInput value={search} onChange={setSearch} placeholder="Search title, style, location…" />
            </div>
            <SelectFilter value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} placeholder="All Statuses" />
            <SelectFilter value={typeFilter} onChange={setTypeFilter} options={TYPE_OPTIONS} placeholder="All Types" />
            {styleOptions.length > 1 && (
              <SelectFilter value={styleFilter} onChange={setStyleFilter} options={styleOptions} placeholder="All Styles" />
            )}
          </div>
        )}
      </div>

      {/* Calendar views */}
      {(viewMode === "weekly" || viewMode === "monthly") && (
        <ScheduleCalendar
          instances={instances}
          assignments={teacherAssignments}
          teacherRoster={teacherRoster}
          teacherNameMap={teacherNameMap}
          pairPresets={pairPresets}
          onCreateInstance={handleCreateFromDay}
          onReschedule={handleReschedule}
          forcedViewMode={viewMode}
        />
      )}

      {/* Table view */}
      {viewMode === "table" && (
        <>
          {filtered.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No schedule instances found"
              description="Generate from templates or create manually."
              action={
                <div className="flex gap-2">
                  {isDev && (
                    <Button variant="outline" onClick={() => setShowGenerate(true)}>
                      <CalendarPlus className="mr-1.5 h-4 w-4" /> Generate
                    </Button>
                  )}
                  <Button onClick={() => { setAddDefaultDate(null); setShowAdd(true); }}>
                    <Plus className="mr-1.5 h-4 w-4" /> Add Instance
                  </Button>
                </div>
              }
            />
          ) : (
            <AdminTable
              headers={["Title", "Type", "Date", "Time", "Teachers", "Status", "Capacity", "Location", ""]}
              count={filtered.length}
            >
              {filtered.map((bc) => {
                const isExpanded = expandedId === bc.id;
                const isRoleBalanced = bc.styleName != null && roleBalancedSet.has(bc.styleName);
                const { teacher1Name, teacher2Name, isOverride, defaultSummary } = resolveTeachers(bc);

                const teacherCell = teacher1Name
                  ? `${teacher1Name}${teacher2Name ? ` & ${teacher2Name}` : ""}`
                  : "—";

                return (
                  <Fragment key={bc.id}>
                    <tr
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => setExpandedId(isExpanded ? null : bc.id)}
                    >
                      <Td className="font-medium text-gray-900">{bc.title}</Td>
                      <Td>
                        <div className="flex items-center gap-1.5">
                          <StatusBadge status={bc.classType} />
                          {bc.classType === "social" && !settings.socialsBookable && (
                            <Badge variant="warning">Not Bookable</Badge>
                          )}
                          {bc.classType === "student_practice" && !settings.studentPracticeBookable && (
                            <Badge variant="warning">Provisional</Badge>
                          )}
                          {isRoleBalanced && <Badge variant="info">RB</Badge>}
                        </div>
                      </Td>
                      <Td>{formatDate(bc.date)}</Td>
                      <Td>{formatTime(bc.startTime)} – {formatTime(bc.endTime)}</Td>
                      <Td>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm text-gray-600">{teacherCell}</span>
                          {isOverride && <Badge variant="info">Date-specific</Badge>}
                        </div>
                      </Td>
                      <Td><StatusBadge status={bc.status} /></Td>
                      <Td><CapacityCell bc={bc} /></Td>
                      <Td>{bc.location}</Td>
                      <Td>
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setOverrideTarget(bc)}
                            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                            title="Date-specific teachers"
                          >
                            <Users className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setEditTarget(bc)}
                            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          {bc.status !== "cancelled" && (
                            <button
                              onClick={() => handleStatusChange(bc.id, "cancelled")}
                              disabled={statusPending}
                              className="rounded p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600"
                              title="Cancel"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {bc.status === "scheduled" && (
                            <button
                              onClick={() => handleStatusChange(bc.id, "open")}
                              disabled={statusPending}
                              className="rounded p-1.5 text-green-500 hover:bg-green-50 hover:text-green-600"
                              title="Open"
                            >
                              <Unlock className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {bc.status === "open" && (
                            <button
                              onClick={() => handleStatusChange(bc.id, "closed")}
                              disabled={statusPending}
                              className="rounded p-1.5 text-amber-500 hover:bg-amber-50 hover:text-amber-600"
                              title="Close"
                            >
                              <Lock className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {(bc.status === "closed" || bc.status === "cancelled") && (
                            <button
                              onClick={() => handleStatusChange(bc.id, "open")}
                              disabled={statusPending}
                              className="rounded p-1.5 text-green-500 hover:bg-green-50 hover:text-green-600"
                              title="Reopen"
                            >
                              <Unlock className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {isExpanded ? (
                            <ChevronUp className="h-3.5 w-3.5 text-gray-400" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                          )}
                        </div>
                      </Td>
                    </tr>
                    {isExpanded && (
                      <InstanceDetailPanel
                        instance={bc}
                        settings={settings}
                        resolvedTeacher1={teacher1Name}
                        resolvedTeacher2={teacher2Name}
                        isOverride={isOverride}
                        defaultTeacherSummary={defaultSummary}
                      />
                    )}
                  </Fragment>
                );
              })}
            </AdminTable>
          )}
        </>
      )}

      {showAdd && (
        <AddInstanceDialog
          templates={templates}
          onClose={() => { setShowAdd(false); setAddDefaultDate(null); }}
          defaultDate={addDefaultDate ?? undefined}
        />
      )}
      {editTarget && <EditInstanceDialog instance={editTarget} onClose={() => setEditTarget(null)} />}
      {showGenerate && (
        <GenerateScheduleDialog
          activeTemplateCount={activeTemplateCount}
          totalTemplateCount={totalTemplateCount}
          onClose={() => setShowGenerate(false)}
        />
      )}
      {overrideTarget && (
        <TeacherOverrideDialog
          instance={overrideTarget}
          teacherRoster={teacherRoster}
          teacherNameMap={teacherNameMap}
          onClose={() => setOverrideTarget(null)}
        />
      )}
      {rescheduleTarget && (
        <RescheduleConfirmDialog
          instance={rescheduleTarget.instance}
          newDate={rescheduleTarget.newDate}
          instances={instances}
          teacherAssignments={teacherAssignments}
          teacherNameMap={teacherNameMap}
          onConfirm={() => {
            setRescheduleTarget(null);
            router.refresh();
          }}
          onEdit={() => {
            const inst = rescheduleTarget.instance;
            setRescheduleTarget(null);
            setEditTarget(inst);
          }}
          onClose={() => setRescheduleTarget(null)}
        />
      )}
    </div>
  );
}

function CapacityCell({ bc }: { bc: MockBookableClass }) {
  if (bc.maxCapacity == null) return <span>—</span>;
  const hasRoleCaps = bc.leaderCap != null && bc.followerCap != null;
  return (
    <div>
      <span>{bc.bookedCount} / {bc.maxCapacity}</span>
      {hasRoleCaps && (
        <span className="ml-1.5 text-xs text-gray-400">({bc.leaderCount}L / {bc.followerCount}F)</span>
      )}
      {bc.waitlistCount > 0 && (
        <span className="ml-1.5 text-xs text-amber-600">+{bc.waitlistCount} wl</span>
      )}
    </div>
  );
}

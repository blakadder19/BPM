"use client";

import { useState, useMemo, useTransition, useCallback, Fragment } from "react";
import { useRouter } from "next/navigation";
import {
  Inbox, Plus, ChevronDown, ChevronUp, Pencil,
  CalendarPlus, Trash2, XCircle, Lock, Unlock, Users,
  List, Calendar, LayoutGrid, ListChecks, Copy,
} from "lucide-react";
import type { MockBookableClass, MockClass, MockTeacherPair } from "@/lib/mock-data";
import type { Teacher } from "@/lib/services/teacher-roster-store";
import type { PairPreset } from "@/lib/services/pair-preset-store";
import { PageHeader } from "@/components/ui/page-header";
import { AdminHelpButton } from "@/components/admin/admin-help-panel";
import { SearchInput } from "@/components/ui/search-input";
import { SelectFilter } from "@/components/ui/select-filter";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { AdminTable, Td } from "@/components/ui/admin-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { formatDate, formatTime } from "@/lib/utils";
import { effectiveInstanceStatus, isClassEnded } from "@/lib/domain/datetime";
import {
  AddInstanceDialog,
  EditInstanceDialog,
  GenerateScheduleDialog,
  InstanceDetailPanel,
  TeacherOverrideDialog,
} from "./schedule-dialogs";
import { BulkCreateDialog } from "./bulk-create-dialog";
import { CopyMonthDialog } from "./copy-month-dialog";
import { ScheduleCalendar } from "./schedule-calendar";
import { RescheduleConfirmDialog } from "./reschedule-confirm-dialog";
import { StudentImpactModal } from "./student-impact-modal";

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

/**
 * Plain-boolean permissions resolved server-side from the current
 * staff access. Each flag corresponds 1:1 to a permission key
 * checked by the matching server action.
 */
export interface AdminSchedulePermissions {
  canCreate: boolean;
  canEdit: boolean;
  canCancel: boolean;
  canDelete: boolean;
  canAssignTeachers: boolean;
}

interface AdminScheduleProps {
  instances: MockBookableClass[];
  templates: MockClass[];
  allStyles?: { id: string; name: string }[];
  allTerms?: { id: string; name: string; startDate: string; endDate: string }[];
  settings: SettingsFlags;
  teacherAssignments: MockTeacherPair[];
  teacherRoster: Teacher[];
  teacherNameMap: Record<string, string>;
  inactiveTeacherIds?: string[];
  pairPresets: PairPreset[];
  isDev?: boolean;
  initialSearch?: string;
  initialDate?: string;
  today?: string;
  permissions: AdminSchedulePermissions;
}

export function AdminSchedule({
  instances,
  templates,
  allStyles,
  allTerms,
  settings,
  teacherAssignments,
  teacherRoster,
  teacherNameMap,
  inactiveTeacherIds,
  pairPresets,
  isDev,
  initialSearch,
  initialDate,
  today: todayProp,
  permissions,
}: AdminScheduleProps) {
  const inactiveSet = useMemo(() => new Set(inactiveTeacherIds ?? []), [inactiveTeacherIds]);
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [search, setSearch] = useState(initialSearch ?? "");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [styleFilter, setStyleFilter] = useState("");
  const [dateFilter, setDateFilter] = useState(initialDate ?? "");
  const [hidePast, setHidePast] = useState(!initialDate);
  const today = todayProp ?? new Date().toISOString().slice(0, 10);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addDefaultDate, setAddDefaultDate] = useState<string | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [showBulkCreate, setShowBulkCreate] = useState(false);
  const [showCopyMonth, setShowCopyMonth] = useState(false);
  const [editTarget, setEditTarget] = useState<MockBookableClass | null>(null);
  const [overrideTarget, setOverrideTarget] = useState<MockBookableClass | null>(null);
  const [statusPending, startStatusTransition] = useTransition();
  const [clearPending, startClear] = useTransition();
  const [clearResult, setClearResult] = useState<string | null>(null);

  const [rescheduleTarget, setRescheduleTarget] = useState<{ instance: MockBookableClass; newDate: string } | null>(null);
  const [cancelConfirmTarget, setCancelConfirmTarget] = useState<MockBookableClass | null>(null);
  const [cancelConfirmAction, setCancelConfirmAction] = useState<"cancel" | "delete">("cancel");
  const [cancelConfirmPending, startCancelConfirm] = useTransition();

  const resolve = (id: string | null | undefined) => (id ? teacherNameMap[id] ?? null : null);

  function resolveWithInactive(id: string | null | undefined): string | null {
    if (!id) return null;
    const name = teacherNameMap[id];
    if (!name) return null;
    if (inactiveSet.has(id)) return `${name} (Inactive)`;
    return name;
  }

  function resolveTeachers(bc: MockBookableClass) {
    const hasOverride = !!bc.teacherOverride1Id;
    if (hasOverride) {
      const defaultAssignment = bc.classId
        ? teacherAssignments.find((a) => a.classId === bc.classId && a.isActive)
        : null;
      const defT1 = resolveWithInactive(defaultAssignment?.teacher1Id);
      const defT2 = resolveWithInactive(defaultAssignment?.teacher2Id);
      const defaultSummary = defT1
        ? `${defT1}${defT2 ? ` & ${defT2}` : " (solo)"}`
        : "Unassigned";
      return {
        teacher1Name: resolveWithInactive(bc.teacherOverride1Id),
        teacher2Name: resolveWithInactive(bc.teacherOverride2Id),
        isOverride: true,
        defaultSummary,
      };
    }

    const defaultAssignment = bc.classId
      ? teacherAssignments.find((a) => a.classId === bc.classId && a.isActive)
      : null;
    return {
      teacher1Name: resolveWithInactive(defaultAssignment?.teacher1Id) ?? null,
      teacher2Name: resolveWithInactive(defaultAssignment?.teacher2Id) ?? null,
      isOverride: false,
      defaultSummary: "",
    };
  }

  const styleOptions = useMemo(() => {
    const names = new Set(instances.map((bc) => bc.styleName).filter(Boolean) as string[]);
    return Array.from(names).sort().map((n) => ({ value: n, label: n }));
  }, [instances]);

  const existingInstanceKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const bc of instances) {
      if (bc.classId) keys.add(`${bc.classId}|${bc.date}|${bc.startTime}`);
    }
    return keys;
  }, [instances]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return instances
      .filter((bc) => {
        if (dateFilter) {
          if (bc.date !== dateFilter) return false;
        } else if (hidePast) {
          if (bc.date < today) return false;
          if (bc.date === today && isClassEnded(bc.date, bc.endTime)) return false;
        }
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
  }, [instances, search, statusFilter, typeFilter, styleFilter, dateFilter, hidePast, today]);

  function handleStatusChange(id: string, status: string) {
    if (status === "cancelled") {
      const inst = instances.find((bc) => bc.id === id);
      if (inst) {
        setCancelConfirmTarget(inst);
        setCancelConfirmAction("cancel");
        return;
      }
    }
    startStatusTransition(async () => {
      const { updateInstanceStatusAction } = await import("@/lib/actions/classes");
      await updateInstanceStatusAction(id, status as "scheduled" | "open" | "closed" | "cancelled");
      router.refresh();
    });
  }

  function confirmImpactAction(inst: MockBookableClass) {
    startCancelConfirm(async () => {
      if (cancelConfirmAction === "delete") {
        const { deleteInstanceAction } = await import("@/lib/actions/classes");
        await deleteInstanceAction(inst.id);
      } else {
        const { updateInstanceStatusAction } = await import("@/lib/actions/classes");
        await updateInstanceStatusAction(inst.id, "cancelled");
      }
      setCancelConfirmTarget(null);
      setCancelConfirmAction("cancel");
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
          <AdminHelpButton pageKey="schedule" />
          {isDev && permissions.canDelete && (
            <Button variant="outline" size="sm" onClick={handleClearSchedule} disabled={clearPending}>
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              {clearPending ? "Clearing…" : "Clear Schedule"}
            </Button>
          )}
          {isDev && permissions.canCreate && (
            <Button variant="outline" onClick={() => setShowGenerate(true)}>
              <CalendarPlus className="mr-1.5 h-4 w-4" />
              Generate Schedule
            </Button>
          )}
          {permissions.canCreate && (
            <Button variant="outline" onClick={() => setShowCopyMonth(true)}>
              <Copy className="mr-1.5 h-4 w-4" />
              Copy Previous Month
            </Button>
          )}
          {permissions.canCreate && (
            <Button variant="outline" onClick={() => setShowBulkCreate(true)}>
              <ListChecks className="mr-1.5 h-4 w-4" />
              Bulk Create
            </Button>
          )}
          {permissions.canCreate && (
            <Button onClick={() => { setAddDefaultDate(null); setShowAdd(true); }}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add Instance
            </Button>
          )}
        </div>
      </div>

      {!permissions.canCreate && !permissions.canEdit && !permissions.canCancel && !permissions.canDelete && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          You have view-only access to this page.
        </div>
      )}

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
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "table" ? "bg-bpm-50 text-bpm-700" : "text-gray-500 hover:text-gray-700"}`}
          >
            <LayoutGrid className="h-3.5 w-3.5" /> Table
          </button>
          <button
            onClick={() => setViewMode("weekly")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "weekly" ? "bg-bpm-50 text-bpm-700" : "text-gray-500 hover:text-gray-700"}`}
          >
            <List className="h-3.5 w-3.5" /> Weekly
          </button>
          <button
            onClick={() => setViewMode("monthly")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "monthly" ? "bg-bpm-50 text-bpm-700" : "text-gray-500 hover:text-gray-700"}`}
          >
            <Calendar className="h-3.5 w-3.5" /> Monthly
          </button>
        </div>

        {viewMode === "table" && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-64">
              <SearchInput value={search} onChange={setSearch} placeholder="Search title, style, location…" />
            </div>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => {
                setDateFilter(e.target.value);
                if (e.target.value) setHidePast(false);
              }}
              className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-700"
            />
            {dateFilter && (
              <button
                onClick={() => { setDateFilter(""); setHidePast(true); }}
                className="rounded-md bg-bpm-50 px-2.5 py-1.5 text-xs font-medium text-bpm-700 hover:bg-bpm-100 transition-colors"
              >
                Clear date filter
              </button>
            )}
            <SelectFilter value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} placeholder="All Statuses" />
            <SelectFilter value={typeFilter} onChange={setTypeFilter} options={TYPE_OPTIONS} placeholder="All Types" />
            {styleOptions.length > 1 && (
              <SelectFilter value={styleFilter} onChange={setStyleFilter} options={styleOptions} placeholder="All Styles" />
            )}
            {!dateFilter && (
              <label className="flex items-center gap-1.5 text-sm text-gray-600 whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={hidePast}
                  onChange={(e) => setHidePast(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Upcoming only
              </label>
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
          allTerms={allTerms}
          inactiveTeacherIds={inactiveTeacherIds}
          onCreateInstance={permissions.canCreate ? handleCreateFromDay : undefined}
          onReschedule={permissions.canEdit ? handleReschedule : undefined}
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
                permissions.canCreate ? (
                  <div className="flex gap-2">
                    {isDev && (
                      <Button variant="outline" onClick={() => setShowGenerate(true)}>
                        <CalendarPlus className="mr-1.5 h-4 w-4" /> Generate
                      </Button>
                    )}
                    <Button variant="outline" onClick={() => setShowCopyMonth(true)}>
                      <Copy className="mr-1.5 h-4 w-4" /> Copy Month
                    </Button>
                    <Button variant="outline" onClick={() => setShowBulkCreate(true)}>
                      <ListChecks className="mr-1.5 h-4 w-4" /> Bulk Create
                    </Button>
                    <Button onClick={() => { setAddDefaultDate(null); setShowAdd(true); }}>
                      <Plus className="mr-1.5 h-4 w-4" /> Add Instance
                    </Button>
                  </div>
                ) : undefined
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
                const effStatus = effectiveInstanceStatus(bc.status, bc.date, bc.startTime, bc.endTime);

                const teacherCell = teacher1Name
                  ? `${teacher1Name}${teacher2Name ? ` & ${teacher2Name}` : ""}`
                  : "No teacher assigned";

                return (
                  <Fragment key={bc.id}>
                    <tr
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => setExpandedId(isExpanded ? null : bc.id)}
                    >
                      <Td className="font-medium text-gray-900">
                        <div className="flex items-center gap-1.5">
                          {bc.title}
                          {(() => {
                            if (!bc.termId) return null;
                            const lt = allTerms?.find((t) => t.id === bc.termId);
                            const isFutureTerm = lt && today < lt.startDate;
                            let wk: number | null = null;
                            if (lt && !isFutureTerm) {
                              const diff = new Date(bc.date + "T00:00:00").getTime() - new Date(lt.startDate + "T00:00:00").getTime();
                              if (diff >= 0) wk = Math.min(Math.floor(diff / (7 * 86_400_000)) + 1, 4);
                            }
                            return (
                              <>
                                {bc.termBound && <Badge variant="warning">Term-enforced</Badge>}
                                {!bc.termBound && <Badge variant="default">Term-linked</Badge>}
                                {isFutureTerm && <Badge variant="info">Future term</Badge>}
                                {wk && <Badge variant="info">W{wk}</Badge>}
                              </>
                            );
                          })()}
                        </div>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-1.5">
                          <StatusBadge status={bc.classType} />
                          {bc.classType === "social" && !settings.socialsBookable && (
                            <Badge variant="warning">Not Bookable</Badge>
                          )}
                          {bc.classType === "student_practice" && !settings.studentPracticeBookable && (
                            <>
                              <Badge variant="warning">Not Bookable</Badge>
                              <Badge variant="default">Pay at reception</Badge>
                            </>
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
                      <Td><StatusBadge status={effStatus} /></Td>
                      <Td><CapacityCell bc={bc} /></Td>
                      <Td>{bc.location}</Td>
                      <Td>
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          {permissions.canAssignTeachers && (
                            <button
                              onClick={() => setOverrideTarget(bc)}
                              className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                              title="Date-specific teachers"
                            >
                              <Users className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {permissions.canEdit && (
                            <button
                              onClick={() => setEditTarget(bc)}
                              className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                              title="Edit"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {permissions.canCancel && effStatus !== "cancelled" && effStatus !== "ended" && (
                            <button
                              onClick={() => handleStatusChange(bc.id, "cancelled")}
                              disabled={statusPending}
                              className="rounded p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600"
                              title="Cancel"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {permissions.canEdit && effStatus === "scheduled" && (
                            <button
                              onClick={() => handleStatusChange(bc.id, "open")}
                              disabled={statusPending}
                              className="rounded p-1.5 text-green-500 hover:bg-green-50 hover:text-green-600"
                              title="Open"
                            >
                              <Unlock className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {permissions.canEdit && effStatus === "open" && (
                            <button
                              onClick={() => handleStatusChange(bc.id, "closed")}
                              disabled={statusPending}
                              className="rounded p-1.5 text-amber-500 hover:bg-amber-50 hover:text-amber-600"
                              title="Close"
                            >
                              <Lock className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {permissions.canEdit && (effStatus === "closed" || effStatus === "cancelled") && (
                            <button
                              onClick={() => handleStatusChange(bc.id, "open")}
                              disabled={statusPending}
                              className="rounded p-1.5 text-green-500 hover:bg-green-50 hover:text-green-600"
                              title="Reopen"
                            >
                              <Unlock className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {permissions.canDelete && (
                            <button
                              onClick={() => {
                                setCancelConfirmTarget(bc);
                                setCancelConfirmAction("delete");
                              }}
                              className="rounded p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600"
                              title="Delete instance"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
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
                        allTerms={allTerms}
                      />
                    )}
                  </Fragment>
                );
              })}
            </AdminTable>
          )}
        </>
      )}

      {showAdd && permissions.canCreate && (
        <AddInstanceDialog
          templates={templates}
          allStyles={allStyles}
          allTerms={allTerms}
          onClose={() => { setShowAdd(false); setAddDefaultDate(null); }}
          defaultDate={addDefaultDate ?? undefined}
        />
      )}
      {editTarget && permissions.canEdit && <EditInstanceDialog instance={editTarget} allTerms={allTerms} onClose={() => setEditTarget(null)} />}
      {showGenerate && permissions.canCreate && (
        <GenerateScheduleDialog
          activeTemplateCount={activeTemplateCount}
          totalTemplateCount={totalTemplateCount}
          onClose={() => setShowGenerate(false)}
        />
      )}
      {showBulkCreate && permissions.canCreate && (
        <BulkCreateDialog
          templates={templates}
          allTerms={allTerms}
          existingKeys={existingInstanceKeys}
          onClose={() => setShowBulkCreate(false)}
        />
      )}
      {showCopyMonth && permissions.canCreate && (
        <CopyMonthDialog
          instances={instances}
          existingKeys={existingInstanceKeys}
          onClose={() => setShowCopyMonth(false)}
        />
      )}
      {overrideTarget && permissions.canAssignTeachers && (
        <TeacherOverrideDialog
          instance={overrideTarget}
          teacherRoster={teacherRoster}
          teacherNameMap={teacherNameMap}
          onClose={() => setOverrideTarget(null)}
        />
      )}
      {rescheduleTarget && permissions.canEdit && (
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

      {cancelConfirmTarget && (cancelConfirmAction === "delete" ? permissions.canDelete : permissions.canCancel) && (
        <StudentImpactModal
          target={cancelConfirmTarget}
          isPending={cancelConfirmPending}
          action={cancelConfirmAction}
          onConfirm={() => confirmImpactAction(cancelConfirmTarget)}
          onClose={() => { setCancelConfirmTarget(null); setCancelConfirmAction("cancel"); }}
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



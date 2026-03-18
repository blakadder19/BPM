"use client";

import { useState, useMemo, useTransition, Fragment } from "react";
import { useRouter } from "next/navigation";
import { Inbox, Plus, ChevronDown, ChevronUp, Pencil, Power } from "lucide-react";
import type { MockClass, MockTeacherPair } from "@/lib/mock-data";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { SelectFilter } from "@/components/ui/select-filter";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { AdminTable, Td } from "@/components/ui/admin-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { dayName, formatTime } from "@/lib/utils";
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

interface AdminTemplatesProps {
  templates: MockClass[];
  allStyles: StyleOption[];
  settings: SettingsFlags;
  teacherAssignments: MockTeacherPair[];
  teacherNameMap: Record<string, string>;
  isDev?: boolean;
}

export function AdminTemplates({
  templates,
  allStyles,
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

  const styleOptions = useMemo(
    () => allStyles.map((s) => ({ value: s.name, label: s.name })),
    [allStyles]
  );

  const resolve = (id: string | null) => (id ? teacherNameMap[id] ?? id : null);

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
                        teacher1Name: resolve(a.teacher1Id) ?? a.teacher1Id,
                        teacher2Name: resolve(a.teacher2Id),
                        effectiveFrom: a.effectiveFrom,
                      }))}
                  />
                )}
              </Fragment>
            );
          })}
        </AdminTable>
      )}

      {showAdd && (
        <AddTemplateDialog allStyles={allStyles} onClose={() => setShowAdd(false)} />
      )}
      {editTarget && (
        <EditTemplateDialog template={editTarget} allStyles={allStyles} onClose={() => setEditTarget(null)} />
      )}
    </div>
  );
}

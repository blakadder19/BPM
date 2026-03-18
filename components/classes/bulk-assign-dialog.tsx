"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Users, Trash2, RefreshCw, Layers, CalendarDays, AlertTriangle, RotateCcw } from "lucide-react";
import type { MockBookableClass } from "@/lib/mock-data";
import type { Teacher } from "@/lib/services/teacher-roster-store";
import type { ResolvedEntry } from "@/lib/domain/conflict-utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SelectFilter } from "@/components/ui/select-filter";
import { Badge } from "@/components/ui/badge";

type BulkAction = "clear" | "assign" | "replace" | "restore";
type WriteTarget = "instances" | "defaults";

interface BulkAssignDialogProps {
  visibleEntries: ResolvedEntry[];
  instances: MockBookableClass[];
  teacherRoster: Teacher[];
  teacherNameMap: Record<string, string>;
  onClose: () => void;
}

function previewResultLabel(
  entry: ResolvedEntry,
  action: BulkAction,
  target: WriteTarget,
  alsoUnblock: boolean
): string {
  if (action === "restore") {
    if (entry.source === "blocked") return entry.hasDefaultAssignment ? "→ Regular" : "→ No regular teacher";
    return entry.source;
  }
  if (action === "clear") {
    if (target === "defaults") {
      if (entry.source === "blocked") return alsoUnblock ? "→ No regular teacher" : "No teacher assigned (stays)";
      if (entry.source === "override" || entry.source === "one-off") return "This date (stays)";
      return "→ No regular teacher";
    }
    if (entry.hasDefaultAssignment) return "→ No teacher assigned";
    return "→ No regular teacher";
  }
  if (action === "assign" || action === "replace") {
    if (target === "defaults") {
      if (entry.source === "blocked") return alsoUnblock ? "→ Regular" : "No teacher assigned (stays)";
      if (entry.source === "override" || entry.source === "one-off") return "This date (stays)";
      return "→ Regular";
    }
    return "→ This date only";
  }
  return entry.source;
}

export function BulkAssignDialog({
  visibleEntries,
  instances,
  teacherRoster,
  teacherNameMap,
  onClose,
}: BulkAssignDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const activeRoster = teacherRoster.filter((t) => t.isActive);

  const [writeTarget, setWriteTarget] = useState<WriteTarget>("instances");
  const [scopeClassId, setScopeClassId] = useState("");
  const [scopeStyle, setScopeStyle] = useState("");
  const [scopeTeacher, setScopeTeacher] = useState("");
  const [scopeSource, setScopeSource] = useState("");
  const [action, setAction] = useState<BulkAction>("assign");
  const [newTeacher1Id, setNewTeacher1Id] = useState("");
  const [newTeacher2Id, setNewTeacher2Id] = useState("");
  const [alsoUnblock, setAlsoUnblock] = useState(false);

  const classOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of visibleEntries) {
      if (e.classId && !map.has(e.classId)) map.set(e.classId, e.classTitle);
    }
    return Array.from(map).map(([id, title]) => ({ value: id, label: title }));
  }, [visibleEntries]);

  const styleOptions = useMemo(() => {
    const names = new Set(visibleEntries.map((e) => e.styleName).filter(Boolean) as string[]);
    return Array.from(names).sort().map((n) => ({ value: n, label: n }));
  }, [visibleEntries]);

  const teacherOptions = useMemo(() => {
    return activeRoster.map((t) => ({ value: t.id, label: t.fullName }));
  }, [activeRoster]);

  const sourceOptions = [
    { value: "default", label: "Regular" },
    { value: "override", label: "This date only (has regular)" },
    { value: "one-off", label: "This date only (no regular)" },
    { value: "blocked", label: "No teacher assigned" },
    { value: "unassigned", label: "No regular teacher set" },
  ];

  const matching = useMemo(() => {
    return visibleEntries.filter((e) => {
      if (scopeClassId && e.classId !== scopeClassId) return false;
      if (scopeStyle && e.styleName !== scopeStyle) return false;
      if (scopeTeacher && e.teacher1Id !== scopeTeacher && e.teacher2Id !== scopeTeacher) return false;
      if (scopeSource && e.source !== scopeSource) return false;
      return true;
    });
  }, [visibleEntries, scopeClassId, scopeStyle, scopeTeacher, scopeSource]);

  const blockedInScope = useMemo(
    () => matching.filter((e) => e.source === "blocked"),
    [matching]
  );

  function handleApply() {
    if (matching.length === 0) {
      setError("No instances match the current scope");
      return;
    }

    if (action === "restore") {
      if (blockedInScope.length === 0) {
        setError("No blocked instances in scope to restore");
        return;
      }
    } else if ((action === "assign" || action === "replace") && !newTeacher1Id) {
      setError("Teacher 1 is required for assign/replace");
      return;
    }

    setError(null);
    setResult(null);

    startTransition(async () => {
      const mod = await import("@/lib/actions/classes");

      if (action === "restore") {
        const blockedIds = blockedInScope.map((e) => e.instanceId);
        const res = await mod.bulkSetTeacherOverrideAction(blockedIds, null, null);
        if (!res.success) { setError(res.error ?? "Restore failed"); return; }
        setResult(`Restored regular teachers for ${res.updated} date${res.updated !== 1 ? "s" : ""}`);
        router.refresh();
        return;
      }

      if (writeTarget === "defaults") {
        const classEntries = Array.from(
          new Map(matching.filter((e) => e.classId).map((e) => [e.classId!, { classId: e.classId!, classTitle: e.classTitle }])).values()
        );

        if (classEntries.length === 0) {
          setError("No linked class templates found in the selected instances");
          return;
        }

        if (action === "clear") {
          const res = await mod.bulkDefaultAssignmentAction(classEntries, "clear");
          if (!res.success) { setError(res.error ?? "Bulk clear defaults failed"); return; }
          let msg = `Removed regular teachers for ${res.updated} class${res.updated !== 1 ? "es" : ""}`;

          if (alsoUnblock && blockedInScope.length > 0) {
            const unblockRes = await mod.bulkSetTeacherOverrideAction(blockedInScope.map((e) => e.instanceId), null, null);
            if (unblockRes.success) msg += ` and restored ${unblockRes.updated} cleared date${unblockRes.updated !== 1 ? "s" : ""}`;
          }
          setResult(msg);
        } else {
          const res = await mod.bulkDefaultAssignmentAction(classEntries, "assign", newTeacher1Id, newTeacher2Id || null);
          if (!res.success) { setError(res.error ?? "Bulk assign defaults failed"); return; }
          let msg = `Updated regular teachers for ${res.updated} class${res.updated !== 1 ? "es" : ""}`;

          if (alsoUnblock && blockedInScope.length > 0) {
            const unblockRes = await mod.bulkSetTeacherOverrideAction(blockedInScope.map((e) => e.instanceId), null, null);
            if (unblockRes.success) msg += ` and restored ${unblockRes.updated} cleared date${unblockRes.updated !== 1 ? "s" : ""}`;
          }
          setResult(msg);
        }
      } else {
        const ids = matching.map((e) => e.instanceId);

        if (action === "clear") {
          const needBlock = matching.filter((e) => e.hasDefaultAssignment && e.source !== "override" && e.source !== "one-off" && e.source !== "blocked");
          const needClear = matching.filter((e) => e.source === "override" || e.source === "one-off" || e.source === "blocked");

          let totalUpdated = 0;

          if (needBlock.length > 0) {
            const res = await mod.bulkBlockInstancesAction(needBlock.map((e) => e.instanceId));
            if (!res.success) { setError(res.error ?? "Bulk block failed"); return; }
            totalUpdated += res.updated;
          }

          if (needClear.length > 0) {
            const hasDefaultUnder = needClear.filter((e) => e.hasDefaultAssignment);
            const noDefaultUnder = needClear.filter((e) => !e.hasDefaultAssignment);

            if (hasDefaultUnder.length > 0) {
              const res = await mod.bulkBlockInstancesAction(hasDefaultUnder.map((e) => e.instanceId));
              if (!res.success) { setError(res.error ?? "Bulk block failed"); return; }
              totalUpdated += res.updated;
            }
            if (noDefaultUnder.length > 0) {
              const res = await mod.bulkSetTeacherOverrideAction(noDefaultUnder.map((e) => e.instanceId), null, null);
              if (!res.success) { setError(res.error ?? "Bulk clear failed"); return; }
              totalUpdated += res.updated;
            }
          }

          setResult(`Removed teachers for ${totalUpdated} date${totalUpdated !== 1 ? "s" : ""}`);
        } else {
          const res = await mod.bulkSetTeacherOverrideAction(ids, newTeacher1Id, newTeacher2Id || null);
          if (!res.success) { setError(res.error ?? "Bulk assign failed"); return; }
          setResult(`Assigned teachers for ${res.updated} date${res.updated !== 1 ? "s" : ""}`);
        }
      }

      router.refresh();
    });
  }

  const contextMessage = useMemo(() => {
    if (action === "restore") {
      if (blockedInScope.length === 0) return "No cleared dates in the current scope.";
      const willInherit = blockedInScope.filter((e) => e.hasDefaultAssignment).length;
      const willUnassign = blockedInScope.length - willInherit;
      const parts: string[] = [];
      if (willInherit > 0) parts.push(`${willInherit} will go back to their regular teachers`);
      if (willUnassign > 0) parts.push(`${willUnassign} will still have no teacher (no regular teachers set)`);
      return parts.join(". ") + ".";
    }

    if (action === "clear") {
      if (writeTarget === "defaults") {
        const uniqueClasses = new Set(matching.filter((e) => e.classId).map((e) => e.classId));
        return `Will remove regular teachers for ${uniqueClasses.size} class${uniqueClasses.size !== 1 ? "es" : ""}. Dates with their own specific teachers will keep them.`;
      }
      const withDefault = matching.filter((e) => e.hasDefaultAssignment && e.source !== "blocked");
      const withoutDefault = matching.filter((e) => !e.hasDefaultAssignment && e.source !== "blocked");
      const parts: string[] = [];
      if (withDefault.length > 0) parts.push(`${withDefault.length} will be cleared for these dates (regular teachers still exist)`);
      if (withoutDefault.length > 0) parts.push(`${withoutDefault.length} will have no teacher`);
      if (parts.length === 0) return null;
      return parts.join(". ") + ".";
    }

    if ((action === "assign" || action === "replace") && writeTarget === "defaults" && blockedInScope.length > 0 && !alsoUnblock) {
      return `${blockedInScope.length} date${blockedInScope.length !== 1 ? "s have" : " has"} been cleared and will not use the new regular teachers. Check "Also restore cleared dates" below to include them.`;
    }

    return null;
  }, [action, writeTarget, matching, blockedInScope, alsoUnblock]);

  const showAlsoUnblock = writeTarget === "defaults" && action !== "restore" && blockedInScope.length > 0;

  const uniqueTemplateCount = useMemo(() => {
    return new Set(matching.filter((e) => e.classId).map((e) => e.classId)).size;
  }, [matching]);

  return (
    <Dialog open onClose={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk Assignment Actions</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            {result && <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{result}</div>}

            {/* Write target */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                Where should changes be saved?
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => { setWriteTarget("instances"); if (action === "restore") setAction("assign"); }}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    writeTarget === "instances"
                      ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <CalendarDays className="h-4 w-4 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">These dates only</p>
                    <p className="text-[10px] opacity-70">Only affects visible dates</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setWriteTarget("defaults")}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    writeTarget === "defaults"
                      ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <Layers className="h-4 w-4 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Regular teachers</p>
                    <p className="text-[10px] opacity-70">Applies to all dates</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Scope */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                Which classes?
              </label>
              <div className="grid grid-cols-2 gap-2">
                <SelectFilter value={scopeClassId} onChange={setScopeClassId} options={classOptions} placeholder="All Classes" />
                {styleOptions.length > 0 && (
                  <SelectFilter value={scopeStyle} onChange={setScopeStyle} options={styleOptions} placeholder="All Styles" />
                )}
                <SelectFilter value={scopeTeacher} onChange={setScopeTeacher} options={teacherOptions} placeholder="All Teachers" />
                <SelectFilter value={scopeSource} onChange={setScopeSource} options={sourceOptions} placeholder="All Sources" />
              </div>
              <p className="mt-1.5 text-xs text-gray-500">
                <strong>{matching.length}</strong> instance{matching.length !== 1 ? "s" : ""} match{matching.length === 1 ? "es" : ""}
                {writeTarget === "defaults" && uniqueTemplateCount > 0 && (
                  <span className="ml-1 text-gray-400">
                    ({uniqueTemplateCount} class{uniqueTemplateCount !== 1 ? "es" : ""})
                  </span>
                )}
                {blockedInScope.length > 0 && (
                  <span className="ml-1 text-gray-500">
                    · <strong>{blockedInScope.length}</strong> cleared
                  </span>
                )}
              </p>
            </div>

            {/* Action */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">Action</label>
              <div className={`grid gap-2 ${writeTarget === "defaults" ? "grid-cols-4" : "grid-cols-3"}`}>
                <button
                  type="button"
                  onClick={() => setAction("clear")}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    action === "clear" ? "border-red-300 bg-red-50 text-red-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Unassign
                </button>
                <button
                  type="button"
                  onClick={() => setAction("assign")}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    action === "assign" ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <Users className="h-3.5 w-3.5" /> Assign
                </button>
                <button
                  type="button"
                  onClick={() => setAction("replace")}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    action === "replace" ? "border-amber-300 bg-amber-50 text-amber-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Replace
                </button>
                {writeTarget === "defaults" && (
                  <button
                    type="button"
                    onClick={() => setAction("restore")}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      action === "restore" ? "border-green-300 bg-green-50 text-green-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Restore
                  </button>
                )}
              </div>
              {action === "restore" && (
                <p className="mt-1.5 text-[11px] text-gray-500">
                  Dates that were cleared will go back to using their regular teachers.
                </p>
              )}
            </div>

            {/* Context/warning message */}
            {contextMessage && (
              <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
                (action === "assign" || action === "replace") && writeTarget === "defaults" && blockedInScope.length > 0 && !alsoUnblock
                  ? "bg-amber-50 text-amber-800"
                  : "bg-gray-50 text-gray-700"
              }`}>
                {(action === "assign" || action === "replace") && writeTarget === "defaults" && blockedInScope.length > 0 && !alsoUnblock && (
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                )}
                <span>{contextMessage}</span>
              </div>
            )}

            {/* Also unblock checkbox */}
            {showAlsoUnblock && (
              <label className="flex items-start gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-xs text-gray-700 transition-colors hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={alsoUnblock}
                  onChange={(e) => setAlsoUnblock(e.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 text-indigo-600"
                />
                <div>
                  <p className="font-medium">Also restore cleared dates ({blockedInScope.length})</p>
                  <p className="mt-0.5 text-gray-500">
                    Cleared dates will {action === "clear" ? "have no teacher" : "use the new regular teachers"}.
                  </p>
                </div>
              </label>
            )}

            {/* Teacher selects for assign/replace */}
            {(action === "assign" || action === "replace") && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600">
                    {action === "replace" ? "New Teacher 1 *" : "Teacher 1 *"}
                  </label>
                  <select
                    value={newTeacher1Id}
                    onChange={(e) => setNewTeacher1Id(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  >
                    <option value="">— Select —</option>
                    {activeRoster.map((t) => (
                      <option key={t.id} value={t.id}>{t.fullName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600">
                    {action === "replace" ? "New Teacher 2" : "Teacher 2"}
                  </label>
                  <select
                    value={newTeacher2Id}
                    onChange={(e) => setNewTeacher2Id(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  >
                    <option value="">— None —</option>
                    {activeRoster.map((t) => (
                      <option key={t.id} value={t.id}>{t.fullName}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Preview */}
            {matching.length > 0 && matching.length <= 12 && (
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Preview — expected result
                </label>
                <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 p-2">
                  {matching.map((e) => {
                    const rl = previewResultLabel(e, action, writeTarget, alsoUnblock);
                    const staysBlocked = rl.includes("stays");
                    return (
                      <div key={e.instanceId} className={`flex items-center gap-2 text-xs ${staysBlocked ? "text-gray-400" : "text-gray-600"}`}>
                        <Badge
                          variant={e.source === "override" ? "info" : e.source === "one-off" ? "info" : e.source === "default" ? "success" : e.source === "blocked" ? "neutral" : "danger"}
                          className="text-[9px]"
                        >
                          {e.source === "override" ? "Date" : e.source === "one-off" ? "Date" : e.source === "default" ? "Reg" : e.source === "blocked" ? "—" : "—"}
                        </Badge>
                        <span className="font-medium">{e.classTitle}</span>
                        <span className="text-gray-400">{e.date}</span>
                        <span className={`ml-auto shrink-0 text-[10px] font-medium ${staysBlocked ? "text-gray-400" : "text-indigo-600"}`}>
                          {rl}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>Close</Button>
          <Button
            onClick={handleApply}
            disabled={isPending || matching.length === 0}
            variant={action === "clear" ? "outline" : action === "restore" ? "secondary" : "primary"}
          >
            {isPending
              ? "Applying…"
              : action === "restore"
                ? `Restore ${blockedInScope.length} date${blockedInScope.length !== 1 ? "s" : ""}`
                : writeTarget === "defaults"
                  ? `Apply to ${uniqueTemplateCount} class${uniqueTemplateCount !== 1 ? "es" : ""}${alsoUnblock && blockedInScope.length > 0 ? ` + ${blockedInScope.length} cleared` : ""}`
                  : `Apply to ${matching.length} date${matching.length !== 1 ? "s" : ""}`
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

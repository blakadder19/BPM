"use client";

import { useRouter } from "next/navigation";
import { useState, useRef, useEffect, useTransition } from "react";
import Link from "next/link";
import {
  Bell,
  AlertTriangle,
  AlertCircle,
  Info,
  X,
  ChevronRight,
  Menu,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { switchDevRole, switchDevStudent } from "@/lib/actions/auth";
import { dismissStudentNoticeAction } from "@/lib/actions/student-notifications";
import { useDevUnlock } from "@/lib/hooks/use-dev-unlock";
import { useSidebar } from "@/components/providers/sidebar-provider";
import type { AuthUser } from "@/lib/auth";
import type { AdminAlert, AlertSeverity } from "@/lib/domain/admin-alerts";

const ROLE_BADGE: Record<string, "default" | "success" | "info"> = {
  admin: "default",
  teacher: "success",
  student: "info",
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  teacher: "Teacher",
  student: "Student",
};

interface StudentOption {
  id: string;
  fullName: string;
}

interface TopbarProps {
  user: AuthUser;
  alerts?: AdminAlert[];
  devStudents?: StudentOption[];
  devStudentId?: string | null;
}

export function Topbar({ user, alerts, devStudents, devStudentId }: TopbarProps) {
  const { unlocked: showControls } = useDevUnlock();
  const { open: openSidebar } = useSidebar();
  const visibleAlerts = alerts ?? [];

  return (
    <header className="flex h-14 md:h-16 items-center justify-between border-b border-gray-200 bg-white px-3 md:px-6">
      <div className="flex items-center gap-2 md:gap-3 min-w-0">
        <button
          onClick={openSidebar}
          className="md:hidden rounded-lg p-2 text-gray-600 hover:bg-gray-100 shrink-0"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Badge variant={ROLE_BADGE[user.role] ?? "default"}>
          {ROLE_LABELS[user.role] ?? user.role}
        </Badge>
        {showControls && (
          <div className="hidden sm:flex items-center gap-2">
            <DevRoleSwitcher currentRole={user.role} />
            {devStudents && devStudents.length > 0 && (
              <DevStudentSwitcher
                students={devStudents}
                currentStudentId={devStudentId ?? null}
              />
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 md:gap-3 shrink-0">
        <AlertBell alerts={visibleAlerts} isStudent={user.role === "student"} />
        <span className="hidden sm:inline text-sm text-gray-600 truncate max-w-[200px]">
          {user.role === "student" && devStudentId
            ? `${user.fullName} (${user.email})`
            : user.email}
        </span>
      </div>
    </header>
  );
}

// ── Alert Bell ──────────────────────────────────────────────

const SEVERITY_ICON: Record<AlertSeverity, typeof AlertTriangle> = {
  critical: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const SEVERITY_COLORS: Record<AlertSeverity, string> = {
  critical: "text-red-600 bg-red-50",
  warning: "text-amber-600 bg-amber-50",
  info: "text-blue-600 bg-blue-50",
};

const SEVERITY_DOT: Record<AlertSeverity, string> = {
  critical: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
};

function AlertBell({ alerts, isStudent }: { alerts: AdminAlert[]; isStudent?: boolean }) {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const active = alerts.filter((a) => !dismissed.has(a.id));
  const count = active.length;
  const highestSeverity: AlertSeverity | null = active.reduce<AlertSeverity | null>(
    (best, a) => {
      if (!best) return a.severity;
      const order: AlertSeverity[] = ["critical", "warning", "info"];
      return order.indexOf(a.severity) < order.indexOf(best) ? a.severity : best;
    },
    null
  );

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        className={`relative rounded-lg p-2 transition-colors ${
          count > 0
            ? "text-gray-700 hover:bg-gray-100"
            : "text-gray-400 hover:bg-gray-50"
        }`}
        title={count > 0 ? `${count} alert${count !== 1 ? "s" : ""}` : "No alerts"}
      >
        <Bell className="h-5 w-5" />
        {count > 0 && highestSeverity && (
          <span
            className={`absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ${SEVERITY_DOT[highestSeverity]}`}
          >
            {count}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full z-50 mt-1 w-96 rounded-xl border border-gray-200 bg-white shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
            <h3 className="text-sm font-semibold text-gray-800">
              {isStudent ? "Notifications" : "Admin Alerts"}
            </h3>
            {active.length > 0 && (
              <button
                onClick={() => {
                  setDismissed(new Set(alerts.map((a) => a.id)));
                  if (isStudent) {
                    for (const a of active) dismissStudentNoticeAction(a.id);
                  }
                }}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Dismiss all
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto overscroll-y-contain">
            {active.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-gray-400">
                No alerts right now.
              </div>
            ) : (
              active.map((alert) => {
                const Icon = SEVERITY_ICON[alert.severity];
                return (
                  <div
                    key={alert.id}
                    className="group relative border-b border-gray-50 px-4 py-3 last:border-0 hover:bg-gray-50/50"
                  >
                    <div className="flex gap-3">
                      <div
                        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${SEVERITY_COLORS[alert.severity]}`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-gray-800">
                            {alert.title}
                          </p>
                          <button
                            onClick={() => {
                              setDismissed((prev) => {
                                const next = new Set(prev);
                                next.add(alert.id);
                                return next;
                              });
                              if (isStudent) dismissStudentNoticeAction(alert.id);
                            }}
                            className="shrink-0 rounded p-0.5 text-gray-300 opacity-0 transition-opacity hover:text-gray-500 group-hover:opacity-100"
                            title="Dismiss"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <p className="mt-0.5 text-xs leading-relaxed text-gray-500">
                          {alert.message}
                        </p>
                        {alert.href && (
                          <Link
                            href={alert.href}
                            onClick={() => setOpen(false)}
                            className="mt-1.5 inline-flex items-center gap-0.5 text-xs font-medium text-indigo-600 hover:text-indigo-700"
                          >
                            View
                            <ChevronRight className="h-3 w-3" />
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DevRoleSwitcher({ currentRole }: { currentRole: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const fd = new FormData();
    fd.set("role", e.target.value);
    startTransition(async () => {
      await switchDevRole(fd);
      router.refresh();
    });
  }

  return (
    <select
      value={currentRole}
      onChange={handleChange}
      disabled={isPending}
      className="rounded border border-dashed border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
    >
      <option value="admin">Dev: Admin</option>
      <option value="teacher">Dev: Teacher</option>
      <option value="student">Dev: Student</option>
    </select>
  );
}

function DevStudentSwitcher({
  students,
  currentStudentId,
}: {
  students: StudentOption[];
  currentStudentId: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    if (!id) return;
    startTransition(async () => {
      await switchDevStudent(id);
      router.refresh();
    });
  }

  return (
    <select
      value={currentStudentId ?? ""}
      onChange={handleChange}
      disabled={isPending}
      className="rounded border border-dashed border-pink-300 bg-pink-50 px-2 py-0.5 text-xs font-medium text-pink-700"
    >
      <option value="" disabled>
        Impersonate…
      </option>
      {students.map((s) => (
        <option key={s.id} value={s.id}>
          {s.fullName}
        </option>
      ))}
    </select>
  );
}

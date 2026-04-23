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
  ExternalLink,
  Megaphone,
  Menu,
  ScanLine,
  User,
  Ticket,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody } from "@/components/ui/dialog";
import dynamic from "next/dynamic";
import { lookupStudentByQrAction, lookupGuestPurchaseByQrAction, type QrLookupResult, type GuestPurchaseQrResult } from "@/lib/actions/qr-checkin";
import { classifyQrToken } from "@/lib/domain/qr-resolver";

const QrScanner = dynamic(
  () => import("@/components/attendance/qr-scanner").then((m) => m.QrScanner),
  { ssr: false },
);
import { switchDevRole, switchDevStudent } from "@/lib/actions/auth";
import { dismissStudentNoticeAction } from "@/lib/actions/student-notifications";
import { fetchStudentAlerts } from "@/lib/actions/student-alerts";
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

  const [studentAlerts, setStudentAlerts] = useState<AdminAlert[]>([]);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (user.role !== "student" || fetchedRef.current) return;
    fetchedRef.current = true;
    fetchStudentAlerts()
      .then(setStudentAlerts)
      .catch(() => {});
  }, [user.role]);

  const visibleAlerts = user.role === "student" ? studentAlerts : (alerts ?? []);

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
        {(user.role === "admin" || user.role === "teacher") && <UnifiedScanner />}
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

// ── Unified QR Scanner ──────────────────────────────────────

type ScanResult =
  | { type: "student"; data: QrLookupResult }
  | { type: "event"; data: GuestPurchaseQrResult }
  | { type: "error"; message: string };

function UnifiedScanner() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);

  function reset() {
    setResult(null);
    setLoading(false);
    setScanning(true);
  }

  function handleClose() {
    setOpen(false);
    setScanning(false);
    setResult(null);
    setLoading(false);
  }

  async function handleScan(code: string) {
    if (loading) return;
    setLoading(true);
    setScanning(false);

    const tokenType = classifyQrToken(code);
    if (tokenType === "student") {
      const res = await lookupStudentByQrAction(code);
      setResult({ type: "student", data: res });
    } else if (tokenType === "event_guest") {
      const res = await lookupGuestPurchaseByQrAction(code);
      setResult({ type: "event", data: res });
    } else {
      setResult({ type: "error", message: "Unknown QR code format" });
    }
    setLoading(false);
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); setScanning(true); setResult(null); }}
        className="relative rounded-lg p-2 text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors"
        title="Scan QR code"
      >
        <ScanLine className="h-5 w-5" />
      </button>

      {open && (
        <Dialog open onClose={handleClose}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ScanLine className="h-5 w-5 text-bpm-600" />
                Scan QR Code
              </DialogTitle>
            </DialogHeader>
            <DialogBody>
              <div className="space-y-4">
                {scanning && !loading && (
                  <QrScanner onScan={handleScan} active={scanning} />
                )}

                {loading && (
                  <div className="flex flex-col items-center justify-center py-10 gap-3 text-gray-500">
                    <Loader2 className="h-8 w-8 animate-spin" />
                    <p className="text-sm">Looking up…</p>
                  </div>
                )}

                {result?.type === "student" && result.data.success && result.data.student && (
                  <div className="rounded-xl border border-gray-200 p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-bpm-100 text-bpm-600">
                        <User className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{result.data.student.name}</p>
                        <p className="text-xs text-gray-500">{result.data.student.email}</p>
                      </div>
                    </div>
                    {result.data.todayBookings && result.data.todayBookings.length > 0 && (
                      <p className="text-xs text-gray-500">
                        {result.data.todayBookings.length} booking{result.data.todayBookings.length !== 1 ? "s" : ""} today
                      </p>
                    )}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => { handleClose(); router.push(`/students?highlight=${result.data.student!.id}`); }}
                        className="flex-1 rounded-lg bg-bpm-600 px-3 py-2 text-sm font-medium text-white hover:bg-bpm-700 transition-colors text-center"
                      >
                        View profile
                      </button>
                      <button
                        onClick={() => { handleClose(); router.push("/attendance?tab=qr"); }}
                        className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors text-center"
                      >
                        Attendance
                      </button>
                    </div>
                  </div>
                )}

                {result?.type === "student" && !result.data.success && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
                    <p className="text-sm font-medium text-red-700">{result.data.error}</p>
                  </div>
                )}

                {result?.type === "event" && result.data.success && result.data.purchase && (
                  <div className="rounded-xl border border-gray-200 p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 text-purple-600">
                        <Ticket className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{result.data.purchase.guestName}</p>
                        <p className="text-xs text-gray-500">{result.data.purchase.eventTitle}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                      <span>{result.data.purchase.productName}</span>
                      <span className={`font-medium ${result.data.purchase.paymentStatus === "paid" ? "text-green-600" : "text-amber-600"}`}>
                        {result.data.purchase.paymentStatus}
                      </span>
                    </div>
                    <button
                      onClick={() => { handleClose(); router.push(`/events/${result.data.purchase!.eventId}/operations`); }}
                      className="w-full rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700 transition-colors text-center"
                    >
                      Event operations
                    </button>
                  </div>
                )}

                {result?.type === "event" && !result.data.success && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
                    <p className="text-sm font-medium text-red-700">{result.data.error}</p>
                  </div>
                )}

                {result?.type === "error" && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
                    <p className="text-sm font-medium text-amber-700">{result.message}</p>
                  </div>
                )}

                {result && (
                  <button
                    onClick={reset}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Scan another
                  </button>
                )}
              </div>
            </DialogBody>
          </DialogContent>
        </Dialog>
      )}
    </>
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
  info: "text-bpm-600 bg-blue-50",
};

const SEVERITY_DOT: Record<AlertSeverity, string> = {
  critical: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
};

function AlertBell({ alerts, isStudent }: { alerts: AdminAlert[]; isStudent?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [detailAlert, setDetailAlert] = useState<AdminAlert | null>(null);
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

  function handleView(alert: AdminAlert) {
    if (alert.broadcast) {
      setOpen(false);
      setDetailAlert(alert);
      return;
    }
    setOpen(false);
    const target = alert.href;
    if (!target) return;
    if (target.includes("#") && window.location.pathname === target.split("#")[0]) {
      const hash = target.split("#")[1];
      window.location.hash = `#${hash}`;
      const el = document.getElementById(hash);
      if (el) {
        setTimeout(() => {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("ring-2", "ring-amber-400", "ring-offset-2");
          setTimeout(() => el.classList.remove("ring-2", "ring-amber-400", "ring-offset-2"), 4000);
        }, 100);
      }
    } else {
      router.push(target);
    }
  }

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
          className="absolute right-0 top-full z-50 mt-1 w-[calc(100vw-2rem)] sm:w-96 rounded-xl border border-gray-200 bg-white shadow-lg"
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
                            onClick={(e) => {
                              e.stopPropagation();
                              setDismissed((prev) => {
                                const next = new Set(prev);
                                next.add(alert.id);
                                return next;
                              });
                              if (isStudent) dismissStudentNoticeAction(alert.id);
                            }}
                            className="shrink-0 rounded p-1 text-gray-300 transition-colors hover:bg-gray-100 hover:text-gray-500"
                            title="Dismiss"
                            aria-label="Dismiss notification"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <p className="mt-0.5 text-xs leading-relaxed text-gray-500 line-clamp-2">
                          {alert.message}
                        </p>
                        {(alert.href || alert.broadcast) && (
                          <button
                            type="button"
                            onClick={() => handleView(alert)}
                            className="mt-1.5 inline-flex items-center gap-0.5 text-xs font-medium text-bpm-600 hover:text-bpm-700"
                          >
                            View
                            <ChevronRight className="h-3 w-3" />
                          </button>
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

      {detailAlert && (
        <NotificationDetailModal
          alert={detailAlert}
          onClose={() => setDetailAlert(null)}
        />
      )}
    </div>
  );
}

// ── Notification Detail Modal ────────────────────────────────

function NotificationDetailModal({
  alert,
  onClose,
}: {
  alert: AdminAlert;
  onClose: () => void;
}) {
  const bc = alert.broadcast;
  const sentDate = bc?.sentAt
    ? new Date(bc.sentAt).toLocaleDateString("en-IE", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <Dialog open onClose={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-bpm-600 shrink-0" />
            <span className="truncate">{alert.title}</span>
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            {bc?.category && (
              <div>
                <Badge variant="default">{bc.category}</Badge>
              </div>
            )}

            {bc?.imageUrl && (
              <div className="mx-auto w-full max-w-[420px] overflow-hidden rounded-xl border border-gray-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={bc.imageUrl}
                  alt=""
                  className="aspect-[4/5] w-full object-cover"
                />
              </div>
            )}

            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
              {alert.message}
            </p>

            {bc?.ctaLabel && bc?.ctaUrl && (() => {
              const isExternal = bc.ctaUrl!.startsWith("http");
              return (
                <a
                  href={bc.ctaUrl!}
                  {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-bpm-600 px-4 py-2 text-sm font-medium text-white hover:bg-bpm-700 transition-colors"
                >
                  {bc.ctaLabel}
                  {isExternal && <ExternalLink className="h-3.5 w-3.5" />}
                </a>
              );
            })()}

            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-gray-100 pt-3 text-xs text-gray-400">
              <span>From BPM Academy</span>
              {sentDate && <span>{sentDate}</span>}
            </div>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
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

"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Wrench, ChevronDown, ChevronUp, X } from "lucide-react";
import {
  devGetStudentState,
  devGetProducts,
  devGetOpenClasses,
  devAssignProduct,
  devRemoveEntitlement,
  devResetEntitlement,
  devAddBooking,
  devCancelBooking,
  devJoinWaitlist,
  devLeaveWaitlist,
  devAddPenalty,
  devWaivePenalty,
  devSwitchRole,
} from "@/lib/actions/dev-tools";
import type { DanceRole } from "@/types/domain";

interface DevPanelProps {
  studentId: string;
  studentName: string;
}

type StudentState = Awaited<ReturnType<typeof devGetStudentState>>;
type ProductOption = { id: string; name: string; productType: string; classesPerTerm: number | null; totalCredits: number | null };
type ClassOption = { id: string; title: string; date: string; startTime: string; requiresRole: boolean };

export function DevPanel({ studentId, studentName }: DevPanelProps) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<StudentState>(null);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const router = useRouter();

  const refresh = useCallback(() => {
    devGetStudentState(studentId).then(setState);
    devGetProducts().then(setProducts);
    devGetOpenClasses().then(setClasses);
  }, [studentId]);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  function act(fn: () => Promise<{ success: boolean; error?: string; [k: string]: unknown }>) {
    startTransition(async () => {
      const res = await fn();
      if (res.success) {
        setToast("Done");
        router.refresh();
        refresh();
      } else {
        setToast(res.error ?? "Failed");
      }
      setTimeout(() => setToast(null), 2000);
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-1.5 rounded-full border-2 border-dashed border-pink-400 bg-pink-50 px-3 py-2 text-xs font-bold text-pink-700 shadow-lg hover:bg-pink-100 transition-colors"
      >
        <Wrench className="h-4 w-4" />
        DEV
      </button>
    );
  }

  return (
    <div className="fixed bottom-0 right-0 z-50 w-96 max-h-[80vh] flex flex-col rounded-tl-xl border-l-2 border-t-2 border-dashed border-pink-400 bg-white shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-pink-200 bg-pink-50 px-4 py-2">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-pink-600" />
          <span className="text-xs font-bold text-pink-800">DEV TOOLS</span>
          <span className="rounded bg-pink-200 px-1.5 py-0.5 text-[10px] font-medium text-pink-700">
            {studentName}
          </span>
        </div>
        <button onClick={() => setOpen(false)} className="text-pink-400 hover:text-pink-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`px-4 py-1.5 text-xs font-medium text-center ${toast === "Done" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {toast}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
        {!state ? (
          <p className="text-gray-400 text-center py-4">Loading…</p>
        ) : (
          <>
            {/* Student Info */}
            <Section title="Student" defaultOpen>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">
                  Role: <strong>{state.student.preferredRole ?? "none"}</strong>
                </span>
                <Btn onClick={() => act(() => devSwitchRole(studentId))} disabled={isPending}>
                  Toggle Role
                </Btn>
              </div>
            </Section>

            {/* Entitlements */}
            <Section title={`Entitlements (${state.subscriptions.length})`} defaultOpen>
              {state.subscriptions.map((s) => (
                <div key={s.id} className="flex items-center justify-between py-1 border-b border-gray-100 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-800 truncate">{s.productName}</p>
                    <p className="text-[10px] text-gray-400">
                      {s.productType === "membership"
                        ? `${s.classesUsed}/${s.classesPerTerm} used`
                        : s.remainingCredits !== null
                          ? `${s.remainingCredits} credits left`
                          : s.status}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Btn onClick={() => act(() => devResetEntitlement(s.id))} disabled={isPending}>
                      Reset
                    </Btn>
                    <Btn onClick={() => act(() => devRemoveEntitlement(s.id))} disabled={isPending} variant="danger">
                      Remove
                    </Btn>
                  </div>
                </div>
              ))}
              <div className="pt-2">
                <AssignProductForm
                  products={products}
                  onAssign={(productId) => act(() => devAssignProduct(studentId, productId))}
                  disabled={isPending}
                />
              </div>
            </Section>

            {/* Bookings */}
            <Section title={`Bookings (${state.bookings.length})`}>
              {state.bookings.map((b) => (
                <div key={b.id} className="flex items-center justify-between py-1 border-b border-gray-100 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-800 truncate">{b.classTitle}</p>
                    <p className="text-[10px] text-gray-400">{b.date}</p>
                  </div>
                  <Btn onClick={() => act(() => devCancelBooking(b.id))} disabled={isPending} variant="danger">
                    Cancel
                  </Btn>
                </div>
              ))}
              <div className="pt-2">
                <AddBookingForm
                  classes={classes}
                  onAdd={(classId, role) => act(() => devAddBooking(studentId, classId, role))}
                  disabled={isPending}
                />
              </div>
            </Section>

            {/* Waitlist */}
            <Section title={`Waitlist (${state.waitlist.length})`}>
              {state.waitlist.map((w) => (
                <div key={w.id} className="flex items-center justify-between py-1 border-b border-gray-100 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-800 truncate">{w.classTitle}</p>
                    <p className="text-[10px] text-gray-400">#{w.position} · {w.date}</p>
                  </div>
                  <Btn onClick={() => act(() => devLeaveWaitlist(w.id))} disabled={isPending} variant="danger">
                    Remove
                  </Btn>
                </div>
              ))}
              <div className="pt-2">
                <AddBookingForm
                  classes={classes}
                  onAdd={(classId, role) => act(() => devJoinWaitlist(studentId, classId, role))}
                  disabled={isPending}
                  label="Join Waitlist"
                />
              </div>
            </Section>

            {/* Penalties */}
            <Section title={`Penalties (${state.penalties.length})`}>
              {state.penalties.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-1 border-b border-gray-100 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-800 truncate">{p.classTitle}</p>
                    <p className="text-[10px] text-gray-400">
                      {p.reason} · €{(p.amountCents / 100).toFixed(2)} · {p.resolution}
                    </p>
                  </div>
                  {p.resolution !== "waived" && (
                    <Btn onClick={() => act(() => devWaivePenalty(p.id))} disabled={isPending}>
                      Waive
                    </Btn>
                  )}
                </div>
              ))}
              <div className="flex gap-1 pt-2">
                <Btn onClick={() => act(() => devAddPenalty(studentId, "late_cancel"))} disabled={isPending}>
                  + Late Cancel
                </Btn>
                <Btn onClick={() => act(() => devAddPenalty(studentId, "no_show"))} disabled={isPending}>
                  + No-Show
                </Btn>
              </div>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-gray-200">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
      >
        {title}
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {open && <div className="px-3 pb-2">{children}</div>}
    </div>
  );
}

function Btn({
  children,
  onClick,
  disabled,
  variant = "default",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "danger";
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors disabled:opacity-50 ${
        variant === "danger"
          ? "bg-red-50 text-red-600 hover:bg-red-100"
          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
      }`}
    >
      {children}
    </button>
  );
}

function AssignProductForm({
  products,
  onAssign,
  disabled,
}: {
  products: ProductOption[];
  onAssign: (productId: string) => void;
  disabled: boolean;
}) {
  const [selected, setSelected] = useState("");
  return (
    <div className="flex gap-1">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="flex-1 rounded border border-gray-200 px-1.5 py-1 text-[10px] text-gray-700"
      >
        <option value="">Select product…</option>
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <Btn
        onClick={() => {
          if (selected) {
            onAssign(selected);
            setSelected("");
          }
        }}
        disabled={disabled || !selected}
      >
        Assign
      </Btn>
    </div>
  );
}

function AddBookingForm({
  classes,
  onAdd,
  disabled,
  label = "Book",
}: {
  classes: ClassOption[];
  onAdd: (classId: string, role: DanceRole | null) => void;
  disabled: boolean;
  label?: string;
}) {
  const [selectedClass, setSelectedClass] = useState("");
  const [role, setRole] = useState<string>("");
  const cls = classes.find((c) => c.id === selectedClass);

  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        <select
          value={selectedClass}
          onChange={(e) => setSelectedClass(e.target.value)}
          className="flex-1 rounded border border-gray-200 px-1.5 py-1 text-[10px] text-gray-700"
        >
          <option value="">Select class…</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title} ({c.date})
            </option>
          ))}
        </select>
      </div>
      {cls?.requiresRole && (
        <div className="flex gap-1">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="flex-1 rounded border border-gray-200 px-1.5 py-1 text-[10px] text-gray-700"
          >
            <option value="">Role…</option>
            <option value="leader">Leader</option>
            <option value="follower">Follower</option>
          </select>
        </div>
      )}
      <Btn
        onClick={() => {
          if (selectedClass) {
            onAdd(selectedClass, (role as DanceRole) || null);
            setSelectedClass("");
            setRole("");
          }
        }}
        disabled={disabled || !selectedClass}
      >
        {label}
      </Btn>
    </div>
  );
}

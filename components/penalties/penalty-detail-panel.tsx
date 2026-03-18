"use client";

import { Check, X, RotateCcw, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate, formatCents } from "@/lib/utils";
import type { StoredPenalty } from "@/lib/services/penalty-service";

interface PenaltyDetailPanelProps {
  penalty: StoredPenalty;
  colSpan: number;
  onResolve: () => void;
  onWaive: () => void;
  onReopen: () => void;
  onEditNotes: () => void;
}

export function PenaltyDetailPanel({
  penalty: p,
  colSpan,
  onResolve,
  onWaive,
  onReopen,
  onEditNotes,
}: PenaltyDetailPanelProps) {
  const isPending = p.resolution === "monetary_pending";

  return (
    <tr>
      <td colSpan={colSpan} className="bg-gray-50 p-0">
        <div className="grid gap-5 px-8 py-5 md:grid-cols-2">
          <Section title="Context">
            <DL label="Student" value={p.studentName} />
            <DL label="Student ID" value={p.studentId} />
            <DL label="Class" value={p.classTitle} />
            <DL label="Class Date" value={formatDate(p.classDate)} />
            <DL label="Booking ID" value={p.bookingId ?? "—"} />
            <DL label="Class ID" value={p.bookableClassId} />
          </Section>

          <Section title="Penalty Info">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500 w-28">Reason</span>
              <StatusBadge status={p.reason} />
            </div>
            <DL label="Amount" value={formatCents(p.amountCents)} />
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500 w-28">Resolution</span>
              <StatusBadge status={p.resolution} />
            </div>
            <DL label="Credit Deducted" value={String(p.creditDeducted)} />
            <DL label="Subscription" value={p.subscriptionId ?? "—"} />
          </Section>

          <Section title="Timeline">
            <DL label="Created" value={formatDate(p.createdAt)} />
          </Section>

          <Section title="Admin Notes">
            {p.notes ? (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{p.notes}</p>
            ) : (
              <p className="text-sm text-gray-400 italic">No notes</p>
            )}
          </Section>

          <Section title="Actions" className="md:col-span-2">
            <div className="flex flex-wrap items-center gap-2">
              {isPending ? (
                <>
                  <Button variant="outline" size="sm" onClick={onResolve}>
                    <Check className="h-3.5 w-3.5 mr-1" />
                    Resolve
                  </Button>
                  <Button variant="ghost" size="sm" onClick={onWaive}>
                    <X className="h-3.5 w-3.5 mr-1" />
                    Waive
                  </Button>
                </>
              ) : (
                <Button variant="outline" size="sm" onClick={onReopen}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                  Reopen
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={onEditNotes}>
                <Pencil className="h-3.5 w-3.5 mr-1" />
                {p.notes ? "Edit Notes" : "Add Notes"}
              </Button>
            </div>
          </Section>
        </div>
      </td>
    </tr>
  );
}

function Section({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`}>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
        {title}
      </h4>
      {children}
    </div>
  );
}

function DL({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-xs font-medium text-gray-500 w-28 flex-shrink-0">{label}</span>
      <span className="text-sm text-gray-700">{value}</span>
    </div>
  );
}

"use client";

import { AlertTriangle, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

export interface ImpactTarget {
  title: string;
  date: string;
  bookedCount: number;
  waitlistCount: number;
}

export function StudentImpactModal({
  target,
  isPending,
  action,
  onConfirm,
  onClose,
}: {
  target: ImpactTarget;
  isPending: boolean;
  action: "cancel" | "delete";
  onConfirm: () => void;
  onClose: () => void;
}) {
  const totalAffected = target.bookedCount + target.waitlistCount;
  const hasImpact = totalAffected > 0;
  const isDelete = action === "delete";
  const verb = isDelete ? "Delete" : "Cancel";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center gap-3 border-b border-gray-100 px-6 py-4">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${hasImpact ? "bg-red-100" : "bg-amber-100"}`}>
            <AlertTriangle className={`h-5 w-5 ${hasImpact ? "text-red-600" : "text-amber-600"}`} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {hasImpact
                ? `${verb} class with ${totalAffected} student${totalAffected !== 1 ? "s" : ""}`
                : `${verb} class`}
            </h3>
            <p className="text-sm text-gray-500">{target.title} · {formatDate(target.date)}</p>
          </div>
        </div>

        <div className="space-y-4 px-6 py-4">
          {hasImpact ? (
            <>
              <p className="text-sm text-gray-700">
                This class has active students. {isDelete ? "Deleting" : "Cancelling"} it will affect them as follows:
              </p>

              <div className="space-y-2">
                {target.bookedCount > 0 && (
                  <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm">
                    <Users className="h-4 w-4 text-blue-600 shrink-0" />
                    <span className="text-blue-800">
                      <strong>{target.bookedCount}</strong> confirmed/checked-in booking{target.bookedCount !== 1 ? "s" : ""} will be cancelled
                    </span>
                  </div>
                )}
                {target.waitlistCount > 0 && (
                  <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm">
                    <Users className="h-4 w-4 text-amber-600 shrink-0" />
                    <span className="text-amber-800">
                      <strong>{target.waitlistCount}</strong> waitlist entr{target.waitlistCount !== 1 ? "ies" : "y"} will be removed
                    </span>
                  </div>
                )}
              </div>

              <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 space-y-1">
                <p>• Credits and class usage will be returned to each student&apos;s entitlement.</p>
                <p>• Students will be notified via an in-app alert.</p>
                <p>• Attendance and check-in records for this class will be reverted.</p>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-700">
              {isDelete
                ? "Are you sure you want to permanently delete this class instance?"
                : "Are you sure you want to cancel this class?"}
            </p>
          )}

          {isDelete && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              This action permanently removes the class instance and cannot be undone.
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isPending}>
            {hasImpact ? "Keep Class" : "Cancel"}
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={isPending}
            onClick={onConfirm}
          >
            {isPending
              ? (isDelete ? "Deleting…" : "Cancelling…")
              : `${verb} Class`}
          </Button>
        </div>
      </div>
    </div>
  );
}

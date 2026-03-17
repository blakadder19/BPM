"use client";

import { AlertTriangle, Inbox } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, formatCents } from "@/lib/utils";

export interface StudentPenaltyView {
  id: string;
  classTitle: string;
  date: string;
  reason: string;
  amountCents: number;
  resolution: string;
  createdAt: string;
}

export function StudentPenalties({
  penalties,
}: {
  penalties: StudentPenaltyView[];
}) {
  const unresolvedCount = penalties.filter(
    (p) => p.resolution === "monetary_pending"
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Penalties"
        description="Late cancel and no-show fees for your bookings."
      />

      {unresolvedCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>
            You have <strong>{unresolvedCount}</strong> unresolved{" "}
            {unresolvedCount === 1 ? "penalty" : "penalties"}.
          </span>
        </div>
      )}

      {penalties.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No penalties"
          description="You don't have any penalty records. Keep it up!"
        />
      ) : (
        <div className="space-y-3">
          {penalties.map((p) => (
            <Card
              key={p.id}
              className={
                p.resolution === "monetary_pending"
                  ? "border-amber-200 bg-amber-50/30"
                  : undefined
              }
            >
              <CardContent className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {p.classTitle}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                    <span>{formatDate(p.date)}</span>
                    <StatusBadge status={p.reason} />
                    <span>Created {formatDate(p.createdAt)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-semibold text-gray-700">
                    {formatCents(p.amountCents)}
                  </span>
                  <StatusBadge status={p.resolution} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

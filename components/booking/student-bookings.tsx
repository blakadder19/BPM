"use client";

import Link from "next/link";
import { CalendarPlus, Inbox } from "lucide-react";
import { BOOKINGS } from "@/lib/mock-data";
import { useUser } from "@/components/providers/user-provider";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { formatDate, formatTime } from "@/lib/utils";

export function StudentBookings() {
  const user = useUser();

  // Mock: match by name. In production, filter by student ID via Supabase.
  const myBookings = BOOKINGS.filter(
    (b) => b.studentName === user.fullName
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Bookings"
        description="Your upcoming and past class bookings."
        actions={
          <Link href="/classes">
            <Button>
              <CalendarPlus className="mr-2 h-4 w-4" />
              Book a class
            </Button>
          </Link>
        }
      />

      {myBookings.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No bookings yet"
          description="Browse available classes and book your first one!"
          action={
            <Link href="/classes">
              <Button>Browse classes</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {myBookings.map((b) => (
            <div
              key={b.id}
              className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div>
                <h3 className="font-medium text-gray-900">{b.classTitle}</h3>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-gray-500">
                  <span>{formatDate(b.date)}</span>
                  <span>{formatTime(b.startTime)}</span>
                  {b.danceRole && <StatusBadge status={b.danceRole} />}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {b.subscriptionName && (
                  <span className="hidden text-xs text-gray-400 sm:block">
                    {b.subscriptionName}
                  </span>
                )}
                <StatusBadge status={b.status} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { CalendarDays, Clock, MapPin, Users, Inbox } from "lucide-react";
import { BOOKABLE_CLASSES, styleRequiresRoleBalance } from "@/lib/mock-data";
import { isBookableClassType } from "@/lib/domain/booking-rules";
import { formatDate, formatTime } from "@/lib/utils";
import { SearchInput } from "@/components/ui/search-input";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

export function ClassBrowser() {
  const [search, setSearch] = useState("");

  const available = useMemo(() => {
    const classes = BOOKABLE_CLASSES.filter(
      (bc) => bc.status === "open" && isBookableClassType(bc.classType)
    );
    if (!search) return classes;
    const q = search.toLowerCase();
    return classes.filter(
      (bc) =>
        bc.title.toLowerCase().includes(q) ||
        bc.styleName?.toLowerCase().includes(q) ||
        bc.level?.toLowerCase().includes(q)
    );
  }, [search]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Available Classes"
        description="Browse and book upcoming classes."
      />

      <div className="w-full sm:max-w-xs">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by name, style, or level…"
        />
      </div>

      {available.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No classes available"
          description="There are no open classes to book right now. Check back soon!"
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {available.map((bc) => {
            const spotsLeft =
              bc.maxCapacity != null ? bc.maxCapacity - bc.bookedCount : null;
            const roleRequired = styleRequiresRoleBalance(bc.styleName);

            return (
              <div
                key={bc.id}
                className="flex flex-col rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex-1 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-semibold text-gray-900">
                      {bc.title}
                    </h3>
                    {roleRequired && (
                      <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                        Role required
                      </span>
                    )}
                  </div>

                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <StatusBadge status={bc.classType} />
                    {bc.level && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        {bc.level}
                      </span>
                    )}
                  </div>

                  <div className="mt-4 space-y-2 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 shrink-0 text-gray-400" />
                      {formatDate(bc.date)}
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 shrink-0 text-gray-400" />
                      {formatTime(bc.startTime)} – {formatTime(bc.endTime)}
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 shrink-0 text-gray-400" />
                      {bc.location}
                    </div>
                    {spotsLeft !== null && (
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 shrink-0 text-gray-400" />
                        <span
                          className={
                            spotsLeft <= 3 ? "font-medium text-amber-600" : ""
                          }
                        >
                          {spotsLeft} {spotsLeft === 1 ? "spot" : "spots"} left
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-gray-100 p-4">
                  <Link href={`/bookings/new?classId=${bc.id}`}>
                    <Button className="w-full">Book this class</Button>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { MapPin, CalendarDays, Star, Ticket, Sparkles, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatEventDateRange } from "@/lib/utils";
import type { MockSpecialEvent, MockEventPurchase } from "@/lib/mock-data";

interface Props {
  events: MockSpecialEvent[];
  purchases: MockEventPurchase[];
}

export function StudentEvents({ events, purchases }: Props) {
  const purchasedEventIds = new Set(purchases.filter((p) => p.paymentStatus !== "refunded").map((p) => p.eventId));

  return (
    <div className="space-y-5">
      <PageHeader title="Special Events" description="Workshops, socials, bootcamps, and guest artist events" />

      {events.length === 0 ? (
        <EmptyState icon={Sparkles} title="No upcoming events" description="Check back soon — new events will appear here when they're published." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {events.map((evt) => {
            const hasPurchase = purchasedEventIds.has(evt.id);
            return (
              <Link
                key={evt.id}
                href={`/events/${evt.id}`}
                className="group rounded-xl border border-gray-200 bg-white overflow-hidden transition-shadow hover:shadow-md"
              >
                {evt.coverImageUrl ? (
                  <div className="relative h-36 sm:h-44 w-full bg-gray-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={evt.coverImageUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                    <div className="absolute top-2 right-2 flex items-center gap-1.5">
                      {evt.isFeatured && (
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/90 shadow-sm">
                          <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                        </span>
                      )}
                      {hasPurchase && (
                        <Badge variant="success" className="shadow-sm"><Ticket className="h-3 w-3 mr-0.5" /> Purchased</Badge>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="relative h-24 w-full bg-gradient-to-br from-bpm-50 to-purple-50 flex items-center justify-center">
                    <Sparkles className="h-8 w-8 text-bpm-200" />
                    <div className="absolute top-2 right-2 flex items-center gap-1.5">
                      {evt.isFeatured && <Star className="h-4 w-4 text-amber-500 fill-amber-500" />}
                      {hasPurchase && (
                        <Badge variant="success"><Ticket className="h-3 w-3 mr-0.5" /> Purchased</Badge>
                      )}
                    </div>
                  </div>
                )}
                <div className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display text-lg font-semibold text-gray-900 group-hover:text-bpm-700 transition-colors">
                    {evt.title}
                  </h3>
                </div>
                {evt.subtitle && (
                  <p className="mt-0.5 text-sm text-gray-500">{evt.subtitle}</p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-gray-600">
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5 text-gray-400" />
                    {formatEventDateRange(evt.startDate, evt.endDate)}
                  </span>
                  {evt.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-gray-400" />
                      {evt.location}
                    </span>
                  )}
                </div>
                {evt.description && (
                  <p className="mt-2 text-xs text-gray-500 line-clamp-2">{evt.description}</p>
                )}
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {evt.salesOpen && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-bpm-50 px-2.5 py-0.5 text-xs font-medium text-bpm-700 border border-bpm-200">
                        Tickets available
                      </span>
                    )}
                  </div>
                  <span className="inline-flex items-center gap-0.5 text-xs font-medium text-bpm-600 group-hover:text-bpm-700">
                    View details <ChevronRight className="h-3 w-3" />
                  </span>
                </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

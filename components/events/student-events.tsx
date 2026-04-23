"use client";

import Link from "next/link";
import { MapPin, CalendarDays, Star, Ticket, Sparkles } from "lucide-react";
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
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3">
          {events.map((evt) => {
            const hasPurchase = purchasedEventIds.has(evt.id);
            return (
              <Link
                key={evt.id}
                href={`/events/${evt.id}`}
                className="group rounded-xl border border-gray-200 bg-white overflow-hidden transition-shadow hover:shadow-md"
              >
                {evt.coverImageUrl ? (
                  /* 4:5 poster aspect ratio — matches vertical Instagram-style uploads */
                  <div className="relative w-full bg-gray-100" style={{ aspectRatio: "4/5" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={evt.coverImageUrl}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
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
                        <Badge variant="success" className="shadow-sm text-[10px] py-0.5"><Ticket className="h-2.5 w-2.5 mr-0.5" /> Purchased</Badge>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="relative w-full bg-gradient-to-br from-bpm-50 to-purple-50 flex items-center justify-center" style={{ aspectRatio: "4/5" }}>
                    <Sparkles className="h-10 w-10 text-bpm-200" />
                    <div className="absolute top-2 right-2 flex items-center gap-1.5">
                      {evt.isFeatured && <Star className="h-4 w-4 text-amber-500 fill-amber-500" />}
                      {hasPurchase && (
                        <Badge variant="success" className="text-[10px] py-0.5"><Ticket className="h-2.5 w-2.5 mr-0.5" /> Purchased</Badge>
                      )}
                    </div>
                  </div>
                )}
                <div className="p-3">
                  <h3 className="font-display text-sm font-semibold text-gray-900 group-hover:text-bpm-700 transition-colors leading-tight line-clamp-2">
                    {evt.title}
                  </h3>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500">
                    <span className="flex items-center gap-0.5">
                      <CalendarDays className="h-3 w-3 text-gray-400" />
                      {formatEventDateRange(evt.startDate, evt.endDate)}
                    </span>
                    {evt.location && (
                      <span className="flex items-center gap-0.5">
                        <MapPin className="h-3 w-3 text-gray-400" />
                        <span className="truncate max-w-[80px]">{evt.location}</span>
                      </span>
                    )}
                  </div>
                  {evt.salesOpen && (
                    <span className="mt-2 inline-flex items-center gap-0.5 rounded-full bg-bpm-50 px-2 py-0.5 text-[10px] font-medium text-bpm-700 border border-bpm-200">
                      Tickets available
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

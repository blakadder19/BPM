"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, AlertCircle, Clock, Loader2 } from "lucide-react";
import { BOOKABLE_CLASSES, styleRequiresRoleBalance } from "@/lib/mock-data";
import { isBookableClassType } from "@/lib/domain/booking-rules";
import { useUser } from "@/components/providers/user-provider";
import {
  createStudentBooking,
  type BookingResult,
} from "@/lib/actions/booking";
import { formatDate, formatTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function FieldError({ error }: { error?: string }) {
  if (!error) return null;
  return <p className="mt-1 text-sm text-red-600">{error}</p>;
}

const INPUT_CLASS =
  "mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export function BookingForm() {
  const searchParams = useSearchParams();
  const user = useUser();
  const preselectedId = searchParams.get("classId") ?? "";

  const [selectedClassId, setSelectedClassId] = useState(preselectedId);

  const availableClasses = useMemo(
    () =>
      BOOKABLE_CLASSES.filter(
        (bc) => bc.status === "open" && isBookableClassType(bc.classType)
      ),
    []
  );

  const selectedClass = availableClasses.find(
    (c) => c.id === selectedClassId
  );
  const requiresRole = selectedClass
    ? styleRequiresRoleBalance(selectedClass.styleName)
    : false;

  const [state, formAction, isPending] = useActionState<
    BookingResult | null,
    FormData
  >(createStudentBooking, null);

  const [danceRole, setDanceRole] = useState<string>("");
  useEffect(() => {
    if (!requiresRole) setDanceRole("");
  }, [requiresRole]);

  if (state?.success && state.status === "confirmed") {
    return (
      <div className="mx-auto max-w-lg">
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <h2 className="mt-4 text-xl font-semibold text-gray-900">
              Booking Confirmed!
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              You&apos;re booked for{" "}
              <span className="font-medium">{state.className}</span>
              {state.date && (
                <>
                  {" "}
                  on <span className="font-medium">{formatDate(state.date)}</span>
                </>
              )}
              .
            </p>
            <p className="mt-1 text-xs text-gray-400">
              Booking ID:{" "}
              <code className="rounded bg-gray-100 px-1.5 py-0.5">
                {state.bookingId}
              </code>
            </p>
            <div className="mt-6 flex gap-3">
              <Link href="/classes">
                <Button variant="outline">Browse more classes</Button>
              </Link>
              <Link href="/bookings">
                <Button>View my bookings</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state?.success && state.status === "waitlisted") {
    return (
      <div className="mx-auto max-w-lg">
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <Clock className="h-12 w-12 text-amber-500" />
            <h2 className="mt-4 text-xl font-semibold text-gray-900">
              Added to Waitlist
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              <span className="font-medium">{state.className}</span>
              {state.date && (
                <>
                  {" "}on{" "}
                  <span className="font-medium">{formatDate(state.date)}</span>
                </>
              )}{" "}
              is currently full for your selected role.
            </p>
            <p className="mt-2 text-sm font-medium text-amber-700">
              You are #{state.waitlistPosition} on the waitlist.
            </p>
            <p className="mt-1 text-xs text-gray-400">
              We&apos;ll notify you if a spot opens up.
            </p>
            <div className="mt-6 flex gap-3">
              <Link href="/classes">
                <Button variant="outline">Browse more classes</Button>
              </Link>
              <Link href="/bookings">
                <Button>View my bookings</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href="/classes"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to classes
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">
          Book a Class
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Fill in your details and confirm your booking.
        </p>
      </div>

      {state?.error && !state.fieldErrors && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
          <p className="text-sm text-red-700">{state.error}</p>
        </div>
      )}

      <form action={formAction}>
        <Card>
          <CardHeader>
            <CardTitle>Class Selection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label htmlFor="bookableClassId" className="block text-sm font-medium text-gray-700">
                Class <span className="text-red-500">*</span>
              </label>
              <select
                id="bookableClassId"
                name="bookableClassId"
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className={INPUT_CLASS}
              >
                <option value="">Select a class…</option>
                {availableClasses.map((bc) => (
                  <option key={bc.id} value={bc.id}>
                    {bc.title} — {formatDate(bc.date)} at{" "}
                    {formatTime(bc.startTime)}
                    {bc.maxCapacity != null
                      ? ` (${bc.maxCapacity - bc.bookedCount} spots left)`
                      : ""}
                  </option>
                ))}
              </select>
              <FieldError error={state?.fieldErrors?.bookableClassId} />
            </div>

            {selectedClass && (
              <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <span className="text-gray-500">Style</span>
                  <span>{selectedClass.styleName ?? "—"}</span>
                  <span className="text-gray-500">Level</span>
                  <span>{selectedClass.level ?? "Open"}</span>
                  <span className="text-gray-500">Location</span>
                  <span>{selectedClass.location}</span>
                  <span className="text-gray-500">Time</span>
                  <span>
                    {formatTime(selectedClass.startTime)} –{" "}
                    {formatTime(selectedClass.endTime)}
                  </span>
                </div>
              </div>
            )}

            {requiresRole && (
              <div>
                <label htmlFor="danceRole" className="block text-sm font-medium text-gray-700">
                  Dance Role <span className="text-red-500">*</span>
                </label>
                <select
                  id="danceRole"
                  name="danceRole"
                  value={danceRole}
                  onChange={(e) => setDanceRole(e.target.value)}
                  className={INPUT_CLASS}
                >
                  <option value="">Select a role…</option>
                  <option value="leader">Leader</option>
                  <option value="follower">Follower</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  This class requires role balancing between leaders and followers.
                </p>
                <FieldError error={state?.fieldErrors?.danceRole} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Your Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label htmlFor="fullName" className="block text-sm font-medium text-gray-700">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                id="fullName"
                name="fullName"
                type="text"
                defaultValue={user.fullName}
                className={INPUT_CLASS}
              />
              <FieldError error={state?.fieldErrors?.fullName} />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                id="email"
                name="email"
                type="email"
                defaultValue={user.email}
                className={INPUT_CLASS}
              />
              <FieldError error={state?.fieldErrors?.email} />
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                Phone <span className="text-red-500">*</span>
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                placeholder="+353 86 …"
                className={INPUT_CLASS}
              />
              <FieldError error={state?.fieldErrors?.phone} />
            </div>

            <div>
              <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
                Notes <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                placeholder="Any special requests or info for the teacher…"
                className={INPUT_CLASS}
              />
            </div>
          </CardContent>
        </Card>

        <div className="mt-6">
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={isPending || !selectedClassId}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Booking…
              </>
            ) : (
              "Confirm Booking"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

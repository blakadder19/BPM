import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Lightweight pointer card to /staff.
 *
 * Replaces the legacy "Admins" section that used to live here. Staff
 * access (admin / teacher / front desk / read only / custom) is now
 * managed exclusively from the Staff & Permissions module so there is
 * a single source of truth for who can do what in the admin shell.
 *
 * The settings page mounts this card only for users who hold the
 * `staff:view` permission (or are a Super Admin), so we don't have to
 * re-check permissions client-side.
 */
export function StaffAccessCard() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-bpm-600" />
          <CardTitle>Staff access</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-600">
          Admin, teacher, front desk and read-only access is now managed from
          Staff &amp; Permissions.
        </p>
        <Link
          href="/staff"
          className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
        >
          Open Staff &amp; Permissions
          <ArrowRight className="h-4 w-4" />
        </Link>
      </CardContent>
    </Card>
  );
}

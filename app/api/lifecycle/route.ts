import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  LIFECYCLE_ALREADY_RUNNING,
  runTermLifecycle,
} from "@/lib/services/term-lifecycle-service";

/**
 * Production-safe scheduled lifecycle endpoint.
 *
 * Trigger modes:
 *  - Vercel Cron: add to vercel.json  { "crons": [{ "path": "/api/lifecycle", "schedule": "0 3 * * *" }] }
 *  - External cron: POST/GET https://<domain>/api/lifecycle with Authorization header
 *
 * The manual "Term Lifecycle" button does NOT come through here; it calls
 * `runTermLifecycleAction`, which requires Super Admin.
 *
 * Authentication: requires CRON_SECRET env var to match the Authorization bearer token.
 * In development only, allows calls when CRON_SECRET is unset.
 */

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return process.env.NODE_ENV === "development";
  }
  const provided = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runTermLifecycle();

  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: result.error === LIFECYCLE_ALREADY_RUNNING ? 409 : 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    trigger: "scheduled",
    ...result.result,
  });
}

export async function POST(request: Request) {
  return GET(request);
}

import { NextResponse } from "next/server";
import { runTermLifecycleAction } from "@/lib/actions/term-lifecycle";

/**
 * Production-safe scheduled lifecycle endpoint.
 *
 * Trigger modes:
 *  - Vercel Cron: add to vercel.json  { "crons": [{ "path": "/api/lifecycle", "schedule": "0 3 * * *" }] }
 *  - External cron: POST/GET https://<domain>/api/lifecycle with Authorization header
 *  - Manual: admin clicks "Term Lifecycle" button in Students page
 *
 * Authentication: requires CRON_SECRET env var to match the Authorization bearer token.
 * In development only, allows calls when CRON_SECRET is unset.
 */

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return process.env.NODE_ENV === "development";
  }
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runTermLifecycleAction("scheduled");

  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: result.error?.includes("already running") ? 409 : 500 }
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

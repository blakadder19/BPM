import { NextResponse } from "next/server";
import { unregisterReceiverAction } from "@/lib/actions/scan-receiver";

/**
 * Beacon endpoint called by GlobalScanReceiver on beforeunload.
 * navigator.sendBeacon can't call server actions, so this thin
 * API route delegates to the server action.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const receiverId = body?.receiverId;
    if (typeof receiverId === "string" && receiverId) {
      await unregisterReceiverAction(receiverId);
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}

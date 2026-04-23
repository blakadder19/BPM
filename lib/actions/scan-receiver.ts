"use server";

import { createClient } from "@supabase/supabase-js";
import { getAuthUser } from "@/lib/auth";
import { classifyQrToken } from "@/lib/domain/qr-resolver";
import { HEARTBEAT_STALE_MS, type ScanReceiver } from "@/lib/domain/scan-receiver";
import { lookupStudentByQr, type QrLookupResult } from "@/lib/actions/qr-checkin";
import type { GuestPurchaseQrResult } from "@/lib/actions/qr-checkin";
import type { GlobalScanResult } from "@/lib/domain/scan-receiver";

// ── DB helper (untyped admin client — scan_receivers not in generated types) ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _cached: any = null;
function db() {
  if (_cached) return _cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  _cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return _cached;
}

function rowToReceiver(row: Record<string, unknown>): ScanReceiver {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    receiverId: row.receiver_id as string,
    lastHeartbeat: row.last_heartbeat as string,
    createdAt: row.created_at as string,
  };
}

// ── Register receiver (laptop tab calls on mount + focus) ────

export async function registerReceiverAction(receiverId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const user = await getAuthUser();
  if (!user || (user.role !== "admin" && user.role !== "teacher")) {
    return { success: false, error: "Not authorized" };
  }

  const { error } = await db()
    .from("scan_receivers")
    .upsert(
      {
        user_id: user.id,
        receiver_id: receiverId,
        last_heartbeat: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (error) {
    console.error("[scan-receiver] Failed to register:", error.message);
    return { success: false, error: "Failed to register receiver" };
  }

  return { success: true };
}

// ── Heartbeat (laptop tab sends periodically) ────────────────

export async function heartbeatReceiverAction(receiverId: string): Promise<{
  success: boolean;
}> {
  const user = await getAuthUser();
  if (!user) return { success: false };

  await db()
    .from("scan_receivers")
    .update({ last_heartbeat: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("receiver_id", receiverId);

  return { success: true };
}

// ── Unregister (laptop tab calls on unmount / beforeunload) ──

export async function unregisterReceiverAction(receiverId: string): Promise<void> {
  const user = await getAuthUser();
  if (!user) return;

  await db()
    .from("scan_receivers")
    .delete()
    .eq("user_id", user.id)
    .eq("receiver_id", receiverId);
}

// ── Get active receiver (mobile checks before scanning) ──────

export async function getActiveReceiverAction(): Promise<{
  active: boolean;
  receiverId?: string;
}> {
  const user = await getAuthUser();
  if (!user || (user.role !== "admin" && user.role !== "teacher")) {
    return { active: false };
  }

  const { data, error } = await db()
    .from("scan_receivers")
    .select()
    .eq("user_id", user.id)
    .single();

  if (error || !data) {
    return { active: false };
  }

  const receiver = rowToReceiver(data);
  const age = Date.now() - new Date(receiver.lastHeartbeat).getTime();
  if (age > HEARTBEAT_STALE_MS) {
    // Stale receiver — clean up
    await db().from("scan_receivers").delete().eq("id", receiver.id);
    return { active: false };
  }

  return { active: true, receiverId: receiver.receiverId };
}

// ── Process a global scan (mobile calls after QR decode) ─────

export async function processGlobalScanAction(qrCode: string): Promise<{
  success: boolean;
  error?: string;
  result?: GlobalScanResult;
  targetReceiverId?: string;
}> {
  const user = await getAuthUser();
  if (!user || (user.role !== "admin" && user.role !== "teacher")) {
    return { success: false, error: "Not authorized" };
  }

  // Look up the active receiver so mobile can include targetReceiverId in broadcast
  const { data: receiverRow } = await db()
    .from("scan_receivers")
    .select()
    .eq("user_id", user.id)
    .single();

  const targetReceiverId = receiverRow?.receiver_id as string | undefined;

  const tokenType = classifyQrToken(qrCode);

  if (tokenType === "student") {
    const data: QrLookupResult = await lookupStudentByQr(qrCode);
    const result: GlobalScanResult = { type: "student", data };
    return { success: true, result, targetReceiverId };
  }

  if (tokenType === "event_guest") {
    // Inline guest lookup without the auth wrapper (we already checked auth above)
    const { isValidGuestPurchaseQrToken } = await import("@/lib/domain/checkin-token");
    if (!isValidGuestPurchaseQrToken(qrCode)) {
      return {
        success: true,
        result: { type: "error", message: "Invalid guest purchase QR code format" },
        targetReceiverId,
      };
    }

    const { getSpecialEventRepo } = await import("@/lib/repositories");
    const repo = getSpecialEventRepo();
    const purchase = await repo.getPurchaseByQrToken(qrCode);
    if (!purchase) {
      return {
        success: true,
        result: { type: "error", message: "No purchase found for this QR code" },
        targetReceiverId,
      };
    }

    const [event, products] = await Promise.all([
      repo.getEventById(purchase.eventId).catch(() => null),
      repo.getProductsByEvent(purchase.eventId).catch(() => []),
    ]);
    const product = products.find((p) => p.id === purchase.eventProductId);

    let inclusionSummary = "";
    if (product) {
      switch (product.inclusionRule) {
        case "all_sessions": inclusionSummary = "All event sessions"; break;
        case "all_workshops": inclusionSummary = "All workshops"; break;
        case "socials_only": inclusionSummary = "Social sessions only"; break;
        case "selected_sessions": inclusionSummary = "Selected sessions"; break;
      }
    }

    const guestResult: GuestPurchaseQrResult = {
      success: true,
      purchase: {
        id: purchase.id,
        eventId: purchase.eventId,
        eventTitle: event?.title ?? "Unknown Event",
        productName: product?.name ?? "Unknown Product",
        productType: product?.productType ?? "ticket",
        guestName: purchase.guestName ?? "Guest",
        guestEmail: purchase.guestEmail ?? "",
        guestPhone: purchase.guestPhone ?? null,
        paymentStatus: purchase.paymentStatus as "paid" | "pending",
        paymentMethod: purchase.paymentMethod as "stripe" | "at_reception",
        purchasedAt: purchase.purchasedAt,
        paidAt: purchase.paidAt ?? null,
        inclusionSummary: inclusionSummary || "",
      },
    };

    return { success: true, result: { type: "event_guest", data: guestResult }, targetReceiverId };
  }

  return {
    success: true,
    result: { type: "error", message: "Unknown QR code format" },
    targetReceiverId,
  };
}

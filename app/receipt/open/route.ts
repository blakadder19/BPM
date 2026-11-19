import { handleGuestReceiptPost } from "@/lib/server/guest-receipt-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handleGuestReceiptPost(request);
}

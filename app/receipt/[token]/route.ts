import { handleGuestReceiptRequest } from "@/lib/server/guest-receipt-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return handleGuestReceiptRequest(token);
}

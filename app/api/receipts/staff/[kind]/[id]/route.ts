import { handleStaffReceiptRequest } from "@/lib/server/staff-receipt-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  return handleStaffReceiptRequest(kind, id);
}
